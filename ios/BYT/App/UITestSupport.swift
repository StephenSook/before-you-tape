#if DEBUG
import BYTCore
import Foundation

/// Debug builds only: the launch argument `-uiTestFakeReader` gives the UI test a fixed reader, an
/// available on-device model and a box kept in memory, so the loop runs with no model and no
/// leftovers from earlier runs. Release builds do not contain this file's code.
enum UITestSupport {
    static var active: Bool { ProcessInfo.processInfo.arguments.contains("-uiTestFakeReader") }

    static let onDevice = OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "UI test", vision: false)

    static func reader() -> ItemReader {
        ItemReader(device: FixedRunner(), makeCloud: { _ in FixedRunner() }, parse: { $0 })
    }

    struct FixedRunner: ItemModelRunner {
        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            .success(ItemReply(read: .object([
                "itemName": .string("Body lotion"), "category": .string("lotion_cream"), "labelText": .string("SHEA BODY LOTION 8 FL OZ"),
                "volts": .number(0), "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0),
                "batteryWords": .bool(false), "liquid": .bool(true), "pressurized": .bool(false), "alcoholOnLabel": .bool(false),
                "flammableOnLabel": .bool(false), "glassContainer": .bool(false), "powder": .bool(false),
                "retailBox": .string("cannot_tell"), "evidence": .string("label_read"),
            ]), tokens: nil))
        }
    }

    final class MemoryBox: BoxPersistence, @unchecked Sendable {
        func save(_ snapshot: BoxSnapshot) {}
        func load(boxId: String) -> BoxSnapshot? { nil }
    }
}
#endif
