import Foundation
import WebSpendKit

enum Dates {
    static func monthID(for date: Date = Date()) -> String {
        let components = Calendar.current.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", components.year ?? 2026, components.month ?? 1)
    }

    static func monthDate(_ id: String) -> Date? {
        let parts = id.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: 1))
    }

    static func shiftMonth(_ id: String, by months: Int) -> String {
        guard let date = monthDate(id), let shifted = Calendar.current.date(byAdding: .month, value: months, to: date) else { return id }
        return monthID(for: shifted)
    }

    static func monthTitle(_ id: String) -> String {
        guard let date = monthDate(id) else { return id }
        return formatter("MMMM yyyy").string(from: date)
    }

    static func monthName(_ id: String) -> String {
        guard let date = monthDate(id) else { return id }
        return formatter("MMMM").string(from: date)
    }

    static func dayHeading(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: Date())
        return formatter(sameYear ? "EEE d MMM" : "EEE d MMM yyyy").string(from: date)
    }

    static func full(_ date: Date) -> String {
        formatter("EEE d MMM yyyy, HH:mm").string(from: date)
    }

    static func short(_ date: Date) -> String {
        formatter("d MMM").string(from: date)
    }

    static func shortYear(_ date: Date) -> String {
        formatter("d MMM yyyy").string(from: date)
    }

    static func full(iso: String) -> String {
        ISO8601.parse(iso).map(full) ?? iso
    }

    static func short(iso: String) -> String {
        ISO8601.parse(iso).map(short) ?? iso
    }

    static func shortYear(iso: String) -> String {
        ISO8601.parse(iso).map(shortYear) ?? iso
    }

    static func relative(_ date: Date, now: Date = Date()) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 60 { return "just now" }
        if seconds < 3600 { return "\(seconds / 60) min ago" }
        if seconds < 86_400 { return "\(seconds / 3600) h ago" }
        return "\(seconds / 86_400) d ago"
    }

    static func relative(iso: String?) -> String? {
        guard let iso, let date = ISO8601.parse(iso) else { return nil }
        return relative(date)
    }

    static func groupByDay(_ transactions: [Transaction]) -> [(heading: String, items: [Transaction])] {
        let calendar = Calendar.current
        var groups: [(day: Date, items: [Transaction])] = []
        for transaction in transactions {
            let day = calendar.startOfDay(for: transaction.occurredDate ?? .distantPast)
            if let index = groups.firstIndex(where: { $0.day == day }) {
                groups[index].items.append(transaction)
            } else {
                groups.append((day, [transaction]))
            }
        }
        return groups
            .sorted { $0.day > $1.day }
            .map { (dayHeading($0.day), $0.items) }
    }

    private static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.dateFormat = format
        return formatter
    }
}
