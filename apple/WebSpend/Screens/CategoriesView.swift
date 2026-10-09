import SwiftUI
import WebSpendKit

struct CategoriesView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var isSheet = false
    @State private var newName = ""
    @State private var renaming: Category?
    @State private var renameText = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                #if os(macOS)
                if !isSheet {
                    Text("Categories").font(.ws(28, .bold)).tracking(-0.56).foregroundStyle(WS.ink)
                }
                #endif
                Text("One list, used on iPhone, Mac and web. Bank alerts rarely say what a payment was for, so you choose from here.")
                    .font(.ws(14)).foregroundStyle(WS.muted)

                HStack(spacing: 8) {
                    TextField("New category", text: $newName)
                        .textFieldStyle(.plain)
                        .font(.ws(15))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(WS.chip, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .onSubmit { add() }
                    Button("Add") { add() }
                        .buttonStyle(PrimaryButtonStyle())
                        .frame(width: 80)
                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                }

                list

                HStack {
                    Text("Needs a category").font(.ws(14, .medium)).foregroundStyle(WS.accentText)
                    Spacer()
                    Text("\(store.summary.value?.uncategorisedCount ?? 0) to sort").font(.ws(13)).foregroundStyle(WS.muted)
                }
                .wsCard(padding: 14)
            }
            .padding(WSLayout.pagePadding)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .wsPage()
        .navigationTitle("Categories")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            if isSheet {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .alert("Rename category", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Name", text: $renameText)
            Button("Save") {
                if let category = renaming {
                    let name = renameText.trimmingCharacters(in: .whitespaces)
                    if !name.isEmpty, name != category.name { Task { await store.renameCategory(id: category.id, name: name) } }
                }
                renaming = nil
            }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .task { if store.categories.value == nil { await store.loadCategories() } }
    }

    @ViewBuilder private var list: some View {
        switch store.categories {
        case .idle, .loading:
            LoadingState().wsCard()
        case let .failed(message):
            ErrorState(message: message) { Task { await store.loadCategories() } }.wsCard()
        case let .loaded(categories):
            if categories.isEmpty {
                EmptyState(title: "No categories yet", message: "Add one above to start sorting spending.", systemImage: "tag").wsCard()
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(categories.enumerated()), id: \.element.id) { index, category in
                        HStack(spacing: 10) {
                            Text(category.name).font(.ws(15, .medium)).foregroundStyle(WS.ink)
                            Spacer()
                            Button {
                                renameText = category.name
                                renaming = category
                            } label: {
                                Text("Rename")
                            }
                            .buttonStyle(LinkButtonStyle())
                            Button {
                                Task { await store.deleteCategory(id: category.id) }
                            } label: {
                                Image(systemName: "minus.circle").foregroundStyle(WS.danger)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove \(category.name)")
                        }
                        .padding(.vertical, 10)
                        if index < categories.count - 1 { Hairline() }
                    }
                }
                .wsCard(padding: 14)
            }
        }
    }

    private func add() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        newName = ""
        Task { await store.createCategory(name: name) }
    }
}

#Preview {
    NavigationStack { CategoriesView() }.environment(AppStore.demo())
}
