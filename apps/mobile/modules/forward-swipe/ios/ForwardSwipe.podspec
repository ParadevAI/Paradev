require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ForwardSwipe'
  s.version        = package['version']
  s.summary        = 'Right-edge swipe that pushes the next screen interactively'
  s.description    = 'Drives a react-native-screens push from a right-edge pan, so the pushed screen follows the finger'
  s.license        = 'MIT'
  s.author         = 'Superset'
  s.homepage       = 'https://superset.sh'
  s.platforms      = { :ios => '26.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/superset-sh/superset.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
