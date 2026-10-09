import WebSpendKit

// SwiftUI has its own `Transaction` and Foundation exports a `Category`; the app always means the
// contract types from WebSpendKit.
typealias Transaction = WebSpendKit.Transaction
typealias Category = WebSpendKit.Category
