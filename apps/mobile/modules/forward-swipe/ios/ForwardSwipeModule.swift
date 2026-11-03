import ExpoModulesCore
import UIKit

public class ForwardSwipeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ForwardSwipe")

    View(ForwardSwipeView.self) {
      Events("onSwipeBegin")

      Prop("enabled") { (view: ForwardSwipeView, enabled: Bool) in
        view.recognizer.isEnabled = enabled
      }
    }
  }
}

/// Selectors that patches/react-native-screens@4.26.0.patch adds to RNSScreenStackView.
@objc private protocol InteractivePushStack {
  func armInteractivePush()
  func updateInteractivePush(_ progress: Double)
  func endInteractivePush(_ finish: Bool)
}

/// Zero-size view placed anywhere inside a native stack screen. A leftward pan from the
/// right edge of that screen asks JS to push, and the push then follows the finger.
final class ForwardSwipeView: ExpoView, UIGestureRecognizerDelegate {
  private static let edgeWidth: CGFloat = 24

  private let onSwipeBegin = EventDispatcher()
  private weak var host: UIView?
  private var stacks: [InteractivePushStack] = []

  /// Not a UIScreenEdgePanGestureRecognizer: that needs edge data only hardware touches carry,
  /// so simulator automation can never trigger it.
  lazy var recognizer: UIPanGestureRecognizer = {
    let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan))
    recognizer.isEnabled = false
    recognizer.delegate = self
    return recognizer
  }()

  override func didMoveToWindow() {
    super.didMoveToWindow()
    host?.removeGestureRecognizer(recognizer)
    host = nil
    guard window != nil, let view = enclosingViewController()?.view else { return }
    view.addGestureRecognizer(recognizer)
    host = view
  }

  deinit {
    host?.removeGestureRecognizer(recognizer)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    guard let window else { return false }
    return touch.location(in: nil).x >= window.bounds.width - Self.edgeWidth
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === recognizer else {
      return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }
    let velocity = recognizer.velocity(in: nil)
    guard velocity.x < 0 && abs(velocity.x) > abs(velocity.y) else { return false }
    cancelReactNativeTouches()
    return true
  }

  /// React Native's touch handler cannot be prevented by this recognizer, so the row under the
  /// finger would press on release. Same reset react-native-screens does for the back swipe.
  private func cancelReactNativeTouches() {
    guard let touchHandlerClass = NSClassFromString("RCTSurfaceTouchHandler") else { return }
    var view = superview
    while let current = view {
      for handler in current.gestureRecognizers ?? [] where handler.isKind(of: touchHandlerClass) {
        handler.isEnabled = false
        handler.isEnabled = true
        handler.reset()
      }
      view = current.superview
    }
  }

  /// Scroll views wait for the edge pan to fail, as they do for UIKit's back swipe.
  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    guard let host, let otherView = otherGestureRecognizer.view else { return false }
    return otherGestureRecognizer is UIPanGestureRecognizer && otherView.isDescendant(of: host)
  }

  private func enclosingViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    return nil
  }

  /// The screen can sit in nested stacks and JS decides which one gets the push,
  /// so every enclosing stack is armed. The ones that get no push disarm themselves.
  private func enclosingStacks() -> [InteractivePushStack] {
    var result: [InteractivePushStack] = []
    var current = enclosingViewController()
    while let navigationController = current?.navigationController {
      if let delegate = navigationController.delegate as? NSObject,
         delegate.responds(to: #selector(InteractivePushStack.armInteractivePush)) {
        result.append(unsafeBitCast(delegate, to: InteractivePushStack.self))
      }
      current = navigationController
    }
    return result
  }

  @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    // Window coordinates: the host view moves with the transition.
    let width = max(window?.bounds.width ?? 1, 1)
    let distance = -recognizer.translation(in: nil).x
    let progress = Double(min(max(distance / width, 0), 1))

    switch recognizer.state {
    case .began:
      stacks = enclosingStacks()
      stacks.forEach { $0.armInteractivePush() }
      onSwipeBegin()
    case .changed:
      stacks.forEach { $0.updateInteractivePush(progress) }
    case .ended, .cancelled, .failed:
      let projected = distance - recognizer.velocity(in: nil).x * 0.3
      let finish = recognizer.state == .ended && projected > width / 2
      stacks.forEach { $0.endInteractivePush(finish) }
      stacks = []
    default:
      break
    }
  }
}
