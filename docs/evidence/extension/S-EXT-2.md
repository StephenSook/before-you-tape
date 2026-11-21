# S-EXT-2 | Hosted cloud bridge

Status: NOT RUN. The hosting policy starts closed. The message handler uses the exact extension origins in the policy for /ext-bridge.html. The released extension ID and deployed bridge are needed for the Chrome spike.

1. Configure the policy with the real extension origin. Build the host with the web app's Firebase configuration. Use a fresh stock Chrome profile and the extension with that ID.
2. Before Allow, check the panel's network log for zero bridge or model requests. After Allow, look for the bridge page on the hosting domain. Check that it receives no product details until Read in the cloud.
3. Make five product reads. Record the SDK route, success and time. Each must return in_cloud in under 15 seconds through the web app's real App Check provider.
4. Run the separate direct SDK control from an extension page. Record the actual provider response. Check that it is 401 or 403 without a cloud credential. The local refusal test intercepts the request and cannot establish the provider response.
5. Frame the hosted page from a different origin. Check that it is blocked or receives no reply. Check that AI monitoring shows no call.
6. Repeat in Chrome with third-party cookies blocked. If the bridge fails, check that the cloud-off message appears within eight seconds of the failed action and the typed path still works.
7. Verify Chrome accepts the extension origin in the hosted frame policy. If it does not, retain the exact-origin message check when revising the frame policy.

No store, hosting or provider result is recorded here.
