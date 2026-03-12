/**
 * Prompt template for extracting durable facts from conversations.
 * Used as guidance for when to call save_memory_fact.
 */
export function memoryExtractionPrompt(): string {
  return [
    "When the user mentions any of the following, extract it as a memory fact:",
    "",
    "ALLERGY: Food allergies or intolerances",
    "  Examples: 'I'm allergic to peanuts', 'I'm lactose intolerant', 'shellfish makes me sick'",
    "",
    "PREFERENCE: Food likes, dislikes, or dietary choices",
    "  Examples: 'I hate cilantro', 'I love spicy food', 'I'm vegetarian', 'I prefer Mediterranean'",
    "",
    "GOAL: Fitness or health goals",
    "  Examples: 'I'm training for a marathon', 'I want to lose 10 lbs', 'I'm trying to build muscle'",
    "",
    "HABIT: Eating patterns or routines",
    "  Examples: 'I skip breakfast', 'I meal prep on Sundays', 'I eat late at night'",
    "",
    "HEALTH: Medical conditions affecting diet",
    "  Examples: 'I have type 2 diabetes', 'I have high cholesterol', 'I'm pregnant'",
    "",
    "Do NOT save:",
    "- Transient facts: 'I had pizza today' (this is a meal log, not a memory)",
    "- Obvious facts: 'I eat food' (not useful)",
    "- Duplicate facts: Check existing memory before saving",
  ].join("\n");
}
