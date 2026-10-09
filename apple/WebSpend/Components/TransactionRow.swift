import SwiftUI
import WebSpendKit

struct TransactionRow: View {
    let transaction: Transaction
    let showUsd: Bool

    var body: some View {
        HStack(spacing: 12) {
            BankBadge(bank: transaction.bank, type: transaction.type)
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.title)
                    .font(.ws(15, .medium))
                    .foregroundStyle(WS.ink)
                    .lineLimit(1)
                subtitle
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                AmountText(transaction: transaction, size: 14)
                if showUsd, let approx = Money.formatApprox(transaction.usdMinor, .usd) {
                    Text(approx).font(.wsMono(12)).foregroundStyle(WS.muted)
                }
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }

    /// One concatenated Text so truncation happens at the end, not inside each part.
    private var subtitle: some View {
        let first: Text
        switch transaction.type {
        case .expense:
            first = Text(transaction.categoryName ?? "Needs a category")
                .foregroundStyle(transaction.categoryId == nil ? WS.accentText : WS.muted)
        case .transfer:
            first = Text("Transfer to self").foregroundStyle(WS.muted)
        case .income:
            first = Text("Income").foregroundStyle(WS.muted)
        }
        let unsure = Text(transaction.unsureTransfer ? " · Unsure" : "").foregroundStyle(WS.accentText)
        return (first + unsure + Text(" · \(transaction.accountName)").foregroundStyle(WS.muted))
            .font(.ws(13))
            .lineLimit(1)
            .truncationMode(.tail)
    }
}

struct AmountText: View {
    let transaction: Transaction
    var size: CGFloat = 15

    var body: some View {
        Text(Money.formatSigned(transaction.defaultMinor ?? transaction.amountMinor, transaction.defaultMinor == nil ? transaction.currency : transaction.defaultCurrency, transaction.type))
            .font(.wsMono(size))
            .foregroundStyle(transaction.type == .transfer ? WS.muted : WS.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .fixedSize(horizontal: true, vertical: false)
    }
}

struct BankBadge: View {
    let bank: Bank
    var type: TransactionType = .expense
    var size: CGFloat = 36

    var body: some View {
        ZStack {
            Circle().fill(WS.chip)
            if type == .income {
                Image(systemName: "arrow.down.left").font(.system(size: size * 0.36, weight: .semibold)).foregroundStyle(WS.accentText)
            } else if type == .transfer {
                Image(systemName: "arrow.left.arrow.right").font(.system(size: size * 0.34, weight: .semibold)).foregroundStyle(WS.muted)
            } else {
                Text(initial).font(.ws(size * 0.38, .semibold)).foregroundStyle(WS.ink)
            }
        }
        .frame(width: size, height: size)
    }

    private var initial: String {
        switch bank {
        case .grey: "G"
        case .opay: "O"
        case .moniepoint: "M"
        case .gtbank: "GT"
        case .uba: "U"
        case .cash: "₦"
        case .other: "•"
        }
    }
}
