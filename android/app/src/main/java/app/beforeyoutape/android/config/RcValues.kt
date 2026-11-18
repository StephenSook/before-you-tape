package app.beforeyoutape.android.config

/**
 * The Remote Config values the app reads. [parse] takes the full map (the in-app defaults from
 * res/xml/remote_config_defaults.xml with any fetched values on top), so the model name comes only
 * from Remote Config or that file. A missing model name reads as empty, and the app then makes no
 * cloud call.
 */
data class RcValues(
    val cloudModelItem: String,
    val killCloud: Boolean,
    val useLimitedUseTokens: Boolean,
    val minimumVersionAndroid: String,
    val onDeviceModelOption: String,
    val rulesEditionId: String,
    val rulesEditionSha256: String,
    val secondLookPolicyJson: String,
) {
    /** True when this app's version is older than the minimum Remote Config asks for. */
    fun needsUpdate(appVersionName: String): Boolean = compare(version(appVersionName) ?: return false, version(minimumVersionAndroid) ?: return false) < 0

    companion object {
        val KEYS = listOf(
            "cloud_model_item", "kill_cloud", "use_limited_use_tokens", "minimum_version_android",
            "ondevice_model_option_android", "rules_edition_id", "rules_edition_sha256", "second_look_policy_json",
        )
        val MODEL_OPTIONS = listOf("stable", "preview", "preview_fast")

        private fun version(s: String): List<Int>? {
            val parts = s.trim().split(".")
            if (parts.size != 3) return null
            return parts.map { it.toIntOrNull()?.takeIf { n -> n >= 0 } ?: return null }
        }

        private fun compare(a: List<Int>, b: List<Int>): Int {
            for (i in 0 until 3) if (a[i] != b[i]) return a[i].compareTo(b[i])
            return 0
        }

        fun parse(values: Map<String, String>): RcValues {
            fun s(k: String) = values[k]?.trim().orEmpty()
            fun b(k: String, default: Boolean) = when (s(k).lowercase()) { "true" -> true; "false" -> false; else -> default }
            val minimum = s("minimum_version_android").takeIf { version(it) != null } ?: "0.0.0"
            return RcValues(
                cloudModelItem = s("cloud_model_item"),
                killCloud = b("kill_cloud", false),
                useLimitedUseTokens = b("use_limited_use_tokens", true),
                minimumVersionAndroid = minimum,
                onDeviceModelOption = s("ondevice_model_option_android").lowercase().takeIf { it in MODEL_OPTIONS } ?: "stable",
                rulesEditionId = s("rules_edition_id"),
                rulesEditionSha256 = s("rules_edition_sha256"),
                secondLookPolicyJson = s("second_look_policy_json"),
            )
        }
    }
}
