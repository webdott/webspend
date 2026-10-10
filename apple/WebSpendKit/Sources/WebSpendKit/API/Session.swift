import Foundation
import Security

public enum SessionStorage {
    public static let defaultServerURL = URL(string: "http://localhost:8787")!
    public static let callbackScheme = "webspend"
    private static let serverKey = "dev.webdott.webspend.serverURL"
    private static let tokenAccount = "session-token"

    public static var serverURL: URL {
        get {
            if let raw = UserDefaults.standard.string(forKey: serverKey), let url = URL(string: raw) { return url }
            return defaultServerURL
        }
        set { UserDefaults.standard.set(newValue.absoluteString, forKey: serverKey) }
    }

    public static func loadToken() -> String? {
        Keychain.read(account: tokenAccount) ?? UserDefaults.standard.string(forKey: fallbackTokenKey)
    }

    /// Stores the token in the Keychain. An unsigned developer build (no keychain entitlement,
    /// as with `xcodebuild` without a team) cannot write there, so it falls back to UserDefaults;
    /// a signed build never takes that path.
    public static func saveToken(_ token: String) throws {
        do {
            try Keychain.write(token, account: tokenAccount)
            UserDefaults.standard.removeObject(forKey: fallbackTokenKey)
        } catch let error as Keychain.KeychainError where error.status == errSecMissingEntitlement {
            UserDefaults.standard.set(token, forKey: fallbackTokenKey)
        }
    }

    public static func deleteToken() {
        Keychain.delete(account: tokenAccount)
        UserDefaults.standard.removeObject(forKey: fallbackTokenKey)
    }

    private static let fallbackTokenKey = "dev.webdott.webspend.sessionToken.unsigned"

    public static func googleSignInURL(server: URL, client: String) -> URL? {
        var components = URLComponents(url: server, resolvingAgainstBaseURL: false)
        let base = components?.path.hasSuffix("/") == true ? String(components!.path.dropLast()) : (components?.path ?? "")
        components?.path = base + "/auth/google"
        components?.queryItems = [URLQueryItem(name: "client", value: client)]
        return components?.url
    }

    public static func token(fromCallback url: URL) -> String? {
        guard url.scheme == callbackScheme else { return nil }
        let candidates = [url.fragment, url.query].compactMap { $0 }
        for raw in candidates {
            for pair in raw.split(separator: "&") {
                let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
                if parts.count == 2, parts[0] == "token", let value = parts[1].removingPercentEncoding, !value.isEmpty {
                    return value
                }
            }
        }
        return nil
    }
}

public enum Keychain {
    public static let service = "dev.webdott.webspend"

    public struct KeychainError: Error, LocalizedError {
        public let status: OSStatus
        public var errorDescription: String? {
            (SecCopyErrorMessageString(status, nil) as String?) ?? "Keychain error \(status)"
        }
    }

    /// Every query uses the app-scoped (data protection) keychain. On macOS the login keychain
    /// ties each item to the code signature that made it, so every ad-hoc build of the app would
    /// be asked for the keychain password to read the last build's token. The app-scoped keychain
    /// has no such prompt; a build with no team cannot use it and falls back to UserDefaults.
    private static func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    public static func read(account: String) -> String? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public static func write(_ value: String, account: String) throws {
        delete(account: account)
        var attributes = baseQuery(account: account)
        attributes[kSecValueData as String] = Data(value.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    public static func delete(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}
