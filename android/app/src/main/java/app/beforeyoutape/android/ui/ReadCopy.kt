package app.beforeyoutape.android.ui

import app.beforeyoutape.engine.ItemCategoryWire
import app.beforeyoutape.engine.RetailBoxWire

/**
 * The item form's words, the web form's own (src/ui/ReadFields.tsx and src/ui/categoryLabels.ts);
 * CopyTest compares them with those files.
 */
object ReadCopy {
    const val NAME = "Name"
    const val NAME_OPTIONAL = "Name (optional)"
    const val CATEGORY = "What is it?"
    const val CHOOSE_ONE = "Choose one"
    const val LABEL_TEXT = "Words on the label"
    const val BOX = "Its box"
    const val SAVE = "Save"
    const val ADD = "Add"

    /** Not typed: a typed label counts as a read label, otherwise the item is only seen. */
    val DERIVED = setOf("evidence")

    val NUMBERS: List<Pair<String, String>> = listOf(
        "volts" to "Volts (V)",
        "milliampHours" to "Milliamp-hours (mAh)",
        "wattHours" to "Watt-hours (Wh)",
        "lithiumGrams" to "Lithium (grams)",
    )

    val FLAGS: List<Pair<String, String>> = listOf(
        "liquid" to "It is a liquid",
        "pressurized" to "It is a spray or under pressure",
        "alcoholOnLabel" to "The label lists alcohol",
        "flammableOnLabel" to "The label says flammable",
        "glassContainer" to "It is in glass",
        "powder" to "It is a powder",
        "batteryWords" to "The label mentions a battery",
    )

    val BOX_VALUES: Map<RetailBoxWire, String> = linkedMapOf(
        RetailBoxWire.sealed to "Still sealed in its box",
        RetailBoxWire.open_or_none to "Opened, or no box",
        RetailBoxWire.cannot_tell to "Can't tell",
    )

    val CATEGORIES: Map<ItemCategoryWire, String> = linkedMapOf(
        ItemCategoryWire.perfume_fragrance to "Perfume or cologne",
        ItemCategoryWire.nail_polish to "Nail polish",
        ItemCategoryWire.aerosol_spray to "Spray can",
        ItemCategoryWire.hand_sanitizer to "Hand sanitizer",
        ItemCategoryWire.lotion_cream to "Lotion or cream",
        ItemCategoryWire.liquid_toiletry to "Shampoo, soap or other liquid toiletry",
        ItemCategoryWire.makeup to "Makeup",
        ItemCategoryWire.powder to "Powder",
        ItemCategoryWire.medicine to "Medicine or vitamins",
        ItemCategoryWire.alcohol_drink to "Alcoholic drink",
        ItemCategoryWire.food_packaged to "Packaged food",
        ItemCategoryWire.chocolate to "Chocolate or sweets",
        ItemCategoryWire.coffee to "Coffee or tea",
        ItemCategoryWire.cooking_oil to "Cooking oil",
        ItemCategoryWire.meat_product to "Meat product",
        ItemCategoryWire.phone to "Phone",
        ItemCategoryWire.tablet to "Tablet",
        ItemCategoryWire.laptop to "Laptop",
        ItemCategoryWire.smartwatch to "Smartwatch",
        ItemCategoryWire.earbuds to "Earbuds or headphones",
        ItemCategoryWire.power_bank to "Power bank",
        ItemCategoryWire.loose_battery to "Loose battery",
        ItemCategoryWire.battery_toy to "Toy with a battery",
        ItemCategoryWire.musical_card to "Card that plays music",
        ItemCategoryWire.other_electronics to "Other electronics",
        ItemCategoryWire.lighter_matches to "Lighter or matches",
        ItemCategoryWire.e_cigarette to "E-cigarette or vape",
        ItemCategoryWire.glue_paint to "Glue or paint",
        ItemCategoryWire.knife_tool to "Knife or tool",
        ItemCategoryWire.toy_gun to "Toy gun",
        ItemCategoryWire.candle to "Candle",
        ItemCategoryWire.jewelry_watch to "Jewelry or watch",
        ItemCategoryWire.clothing to "Clothing",
        ItemCategoryWire.shoes to "Shoes",
        ItemCategoryWire.book_paper to "Book or paper",
        ItemCategoryWire.toy to "Toy",
        ItemCategoryWire.other to "Something else",
    )

    fun fieldLabel(name: String): String? = when (name) {
        "itemName" -> NAME
        "category" -> CATEGORY
        "labelText" -> LABEL_TEXT
        "retailBox" -> BOX
        else -> NUMBERS.firstOrNull { it.first == name }?.second ?: FLAGS.firstOrNull { it.first == name }?.second
    }
}
