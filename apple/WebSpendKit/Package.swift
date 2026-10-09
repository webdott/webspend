// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WebSpendKit",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "WebSpendKit", targets: ["WebSpendKit"]),
    ],
    targets: [
        .target(name: "WebSpendKit"),
        .testTarget(name: "WebSpendKitTests", dependencies: ["WebSpendKit"]),
    ]
)
