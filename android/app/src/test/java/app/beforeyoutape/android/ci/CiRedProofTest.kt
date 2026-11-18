package app.beforeyoutape.android.ci

import org.junit.Assert.fail
import org.junit.Test

/** Temporary: proves the Android CI job goes red on a failing unit test. Reverted in the next commit. */
class CiRedProofTest {
    @Test fun theAndroidJobMustFailOnThis() = fail("deliberate failure to prove the Android CI job can go red")
}
