// Gives each item's verdict in a box file pulled off a phone, with the engine bundle the phone runs,
// in JavaScriptCore, as the iPhone app does. Used for the device check's record.
// Usage: swift ios/scripts/box_verdicts.swift <byt-engine.js> <edition.json> <box.json> <YYYY-MM-DD>
import Foundation
import JavaScriptCore

let a = CommandLine.arguments
let ctx = JSContext()!
ctx.exceptionHandler = { _, e in print("JS error:", e?.toString() ?? "?"); exit(1) }
ctx.evaluateScript(try! String(contentsOfFile: a[1], encoding: .utf8))
let byt = ctx.objectForKeyedSubscript("BYT")!

func call(_ fn: String, _ arg: String) -> Any {
    let text = byt.invokeMethod(fn, withArguments: [arg])!.toString()!
    let r = try! JSONSerialization.jsonObject(with: Data(text.utf8)) as! [String: Any]
    guard r["ok"] as? Bool == true else { print("engine error:", r["error"] ?? ""); exit(1) }
    return r["value"]!
}

_ = call("setEdition", try! String(contentsOfFile: a[2], encoding: .utf8))
let box = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: a[3]))) as! [String: Any]
let items = box["items"] as! [[String: Any]]
// The saved file leaves out empty fields; the app's engine input sends them as null or empty, as here.
let engineItems: [[String: Any]] = items.map { it in
    var e = it
    if e["identityConfirmedBy"] == nil { e["identityConfirmedBy"] = NSNull() }
    for (k, empty) in [("overrides", [String: Any]()), ("answers", [String: Any]())] where e[k] == nil { e[k] = empty }
    if e["labelTags"] == nil { e["labelTags"] = [String]() }
    if e["quantity"] == nil { e["quantity"] = 1 }
    return e
}
let input: [String: Any] = ["items": engineItems, "code": box["destinationCode"]!, "today": a[4]]
let res = call("evaluateBoxJson", String(data: try! JSONSerialization.data(withJSONObject: input), encoding: .utf8)!) as! [String: Any]
let verdicts = res["items"] as! [String: [String: Any]]
for (i, it) in items.enumerated() {
    let read = it["read"] as! [String: Any]
    let v = verdicts[it["itemId"] as! String]!
    let hit = ((v["hits"] as? [[String: Any]])?.first?["ruleId"] as? String) ?? "-"
    let answers = (it["answers"] as? [String: Any])?.count ?? 0
    print("\(i + 1) | \(read["category"]!) | \(read["evidence"]!) | confirmed=\(it["identityConfirmedBy"] as? String ?? "-") | \(v["level"]!) | \(v["headline"]!) | \(hit) | answers=\(answers)")
}
print("counts", res["counts"] ?? "")
