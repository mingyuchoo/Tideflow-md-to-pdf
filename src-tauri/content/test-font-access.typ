#let prefs = json("_prefs.json")

// Test 1: Direct access
#prefs.fonts.main

// Test 2: at() method
#prefs.fonts.at("main")
