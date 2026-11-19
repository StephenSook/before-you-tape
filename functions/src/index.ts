// The QR handoff's two callables. Both require a valid App Check token, used once (replay protection),
// and a signed-in caller; the request data is never logged.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, type CallableOptions } from "firebase-functions/v2/https";
import { joinBoxHandler, startJoinHandler } from "./handlers";

initializeApp();

const options: CallableOptions = { enforceAppCheck: true, consumeAppCheckToken: true, region: "us-central1", maxInstances: 5 };

// The laptop that started a box asks for a code to show as a QR code.
export const startJoin = onCall(options, (req) => startJoinHandler(getFirestore(), req.auth?.uid, req.data, Date.now()));

// A phone presents the code and becomes a member of the box.
export const joinBox = onCall(options, (req) => joinBoxHandler(getFirestore(), req.auth?.uid, req.data, Date.now()));
