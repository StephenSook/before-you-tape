#if DEBUG
import BYTCore
import Foundation

/// Debug builds only: the launch argument `-uiTestFakeReader` gives the UI test a fixed reader, an
/// available on-device model and a box kept in memory, so the loop runs with no model and no
/// leftovers from earlier runs. Release builds do not contain this file's code.
enum UITestSupport {
    static var active: Bool { ProcessInfo.processInfo.arguments.contains("-uiTestFakeReader") }
    /// With `-uiTestSecondLook` too: the on-device model reads photos, and at start one photo is read
    /// on the device as a power bank, with cloud checks allowed, and the cloud reads other numbers,
    /// so the app runs its real second look and the card shows the disputes.
    static var secondLook: Bool { ProcessInfo.processInfo.arguments.contains("-uiTestSecondLook") }

    static var onDevice: OnDeviceStatus {
        OnDeviceStatus(unavailable: nil, localeSupported: true, contextSize: 4096, variant: "UI test", vision: secondLook)
    }

    static func reader() -> ItemReader {
        if secondLook {
            return ItemReader(device: FixedRunner(read: powerBank(milliampHours: 5000, wattHours: 18.5, batteryWords: false)),
                              makeCloud: { _ in FixedRunner(read: powerBank(milliampHours: 10000, wattHours: 37, batteryWords: true)) },
                              parse: { ParsedRead(read: $0) })
        }
        return ItemReader(device: FixedRunner(), makeCloud: { _ in FixedRunner() }, parse: { ParsedRead(read: $0) })
    }

    static func powerBank(milliampHours: Double, wattHours: Double, batteryWords: Bool) -> JSONValue {
        .object([
            "itemName": .string("Power bank"), "category": .string("power_bank"), "labelText": .string("LI-ION 3.7V POWER BANK"),
            "volts": .number(3.7), "milliampHours": .number(milliampHours), "wattHours": .number(wattHours), "lithiumGrams": .number(0),
            "batteryWords": .bool(batteryWords), "liquid": .bool(false), "pressurized": .bool(false), "alcoholOnLabel": .bool(false),
            "flammableOnLabel": .bool(false), "glassContainer": .bool(false), "powder": .bool(false),
            "retailBox": .string("sealed"), "evidence": .string("label_read"),
        ])
    }

    /// The second-look scene: online, cloud checks allowed, then one photo read on the device.
    @MainActor static func readPhotoForSecondLook(_ m: AppModel) async {
        m.network.pathChanged(satisfied: true)
        m.box?.setConsent(true)
        await m.readPhoto(Data([0xFF, 0xD8, 0xFF, 0xD9]))
    }

    /// Every model call the fixed reader takes, counted where the reader is called.
    final class Calls: @unchecked Sendable {
        private let lock = NSLock()
        private var n = 0
        var value: Int { lock.lock(); defer { lock.unlock() }; return n }
        func add() { lock.lock(); n += 1; lock.unlock() }
    }
    static let calls = Calls()

    struct FixedRunner: ItemModelRunner {
        var read: JSONValue = .object([
            "itemName": .string("Body lotion"), "category": .string("lotion_cream"), "labelText": .string("SHEA BODY LOTION 8 FL OZ"),
            "volts": .number(0), "milliampHours": .number(0), "wattHours": .number(0), "lithiumGrams": .number(0),
            "batteryWords": .bool(false), "liquid": .bool(true), "pressurized": .bool(false), "alcoholOnLabel": .bool(false),
            "flammableOnLabel": .bool(false), "glassContainer": .bool(false), "powder": .bool(false),
            "retailBox": .string("cannot_tell"), "evidence": .string("label_read"),
        ])

        func read(_ input: ItemInput) async -> Result<ItemReply, ReadError> {
            UITestSupport.calls.add()
            return .success(ItemReply(read: read, tokens: nil))
        }
    }

    final class MemoryBox: BoxPersistence, @unchecked Sendable {
        func save(_ snapshot: BoxSnapshot) {}
        func load(boxId: String) -> BoxSnapshot? { nil }
    }
}
#endif
