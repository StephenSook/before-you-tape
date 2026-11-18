import Foundation
import Testing
@testable import BYTCore

/// The shared box documents (tests/contracts/box-docs.json): the phone writes exactly the shape
/// the web app writes and firestore.rules enforces.
@Suite struct BoxDocsTests {
    static let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    func fixtureItem() throws -> JSONValue {
        let all = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: Self.repo.appendingPathComponent("tests/contracts/box-docs.json")))
        return try #require(all["item"]?["doc"])
    }

    @Test func decodesTheSharedItemDocumentAndEncodesItBackUnchanged() throws {
        let doc = try fixtureItem()
        let item = try ItemDoc(document: doc)
        #expect(item.itemId == "item-1" && item.readSource == "phone_on_device" && item.quantity == 1)
        #expect(item.readFallback == ItemDoc.Fallback(after: "503", route: "cloud_only"))
        #expect(item.secondLook?.ms == 980)
        #expect(item.document == doc)
    }

    @Test func neverWritesLabelText() throws {
        var item = try ItemDoc(document: try fixtureItem())
        if case var .object(r) = item.read { r["labelText"] = .string("EAU DE PARFUM ALCOHOL DENAT 50 ML"); item.read = .object(r) }
        item.overrides = ["labelText": .string("BODY LOTION"), "itemName": .string("Lotion")]
        let doc = item.document
        #expect(doc["read"]?["labelText"] == .string(""))
        #expect(doc["overrides"] == .object(["itemName": .string("Lotion")]))
    }

    @Test func aFallbackIsWrittenOnlyWhenOneHappened() throws {
        var item = try ItemDoc(document: try fixtureItem())
        item.readFallback = nil
        #expect(item.document["readFallback"] == nil)
        #expect(item.document["secondLook"] != nil)
    }

    @Test func aDocumentWithTheWrongShapeIsRefused() throws {
        guard case var .object(doc) = try fixtureItem() else { return }
        doc["quantity"] = .number(1.5)
        #expect(throws: ItemDoc.DecodeError.self) { try ItemDoc(document: .object(doc)) }
        doc["quantity"] = .number(1)
        doc["readSource"] = .number(3)
        #expect(throws: ItemDoc.DecodeError.self) { try ItemDoc(document: .object(doc)) }
    }
}
