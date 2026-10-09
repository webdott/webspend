import Foundation

enum Loadable<Value: Sendable>: Sendable {
    case idle
    case loading
    case loaded(Value)
    case failed(String)

    var value: Value? {
        if case let .loaded(value) = self { return value }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    var error: String? {
        if case let .failed(message) = self { return message }
        return nil
    }
}
