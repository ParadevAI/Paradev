import ExpoModulesCore
import StoreKit

public final class StorefrontModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Storefront")

    AsyncFunction("countryCode") { () async -> String? in
      await StoreKit.Storefront.current?.countryCode
    }
  }
}
