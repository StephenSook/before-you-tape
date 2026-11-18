package app.beforeyoutape.android.live

/** A test that calls the live Firebase project. Excluded from the default device run; run on request. */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
annotation class Live
