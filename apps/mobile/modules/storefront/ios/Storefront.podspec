require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'Storefront'
  s.version        = package['version']
  s.summary        = 'App Store storefront country for Superset'
  s.description    = 'Reads the StoreKit storefront country code'
  s.license        = 'MIT'
  s.author         = 'Superset'
  s.homepage       = 'https://superset.sh'
  s.platforms      = { :ios => '26.0' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/nicksupersetsh/superset.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
