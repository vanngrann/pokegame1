// The question bank. Edit freely: each question needs a prompt, the right answer,
// and exactly three wrong answers. Options are shuffled every game.
//
// Optional card picture (from the free TCGdex card database):
//   card: { name: "Garchomp", mode: "art" }   looks up a card by exact name (a random printing)
//   card: { id: "swsh7-215", mode: "art" }    one specific card (TCGdex id: set id + card number)
// mode decides when players see it, so the picture never gives the answer away:
//   "art"       artwork only (name, HP, attacks and text hidden) while answering,
//               full card on the reveal. This is the default if mode is left out.
//   "art-only"  artwork only, during the question and the reveal
//   "reveal"    nothing while answering, the full card on the reveal
//   "card"      the full card the whole time. Careful: full cards print the name, HP,
//               attacks, weakness, rule boxes and set number, so only use this when the
//               question is about none of those.
// If the card can't be found or loaded, the question just shows without a picture.
//
// Difficulty: every question has a level, and its points are level x 100.
//   level 1 = 100 very easy, 2 = 200 easy, 3 = 300 medium, 4 = 400 hard, 5 = 500 very hard
// Each game picks one question per level from every category, so a category can hold
// several questions per level and the board changes from game to game. If a level has
// no question, the closest level fills in.
//
// Board: 5 of these categories each game (with 6 or more, they take turns sitting out),
// plus the generated "Card Spotter" and "Price Check" columns, 100 at the top to 500 at
// the bottom. Some cards also hide a wildcard (the host picks how many).

export const BANK = {
  title: "Pokémon Trivia Board",

  categories: [
    {
      name: "Who’s That Pokémon?",
      questions: [
        {
          prompt: "This Ground/Dragon Pokémon evolves from Gabite and is Cynthia’s signature partner.",
          level: 2,
          answer: "Garchomp",
          card: { name: "Garchomp", mode: "art" },
          wrong: ["Salamence", "Flygon", "Haxorus"],
        },
        {
          prompt: "This Ghost/Fairy Pokémon hides under a rag made to look like Pikachu.",
          level: 1,
          answer: "Mimikyu",
          card: { name: "Mimikyu", mode: "art" },
          wrong: ["Ditto", "Zorua", "Banette"],
        },
        {
          prompt: "This Pokémon evolves from Riolu through high friendship during the day.",
          level: 1,
          answer: "Lucario",
          card: { name: "Lucario", mode: "art" },
          wrong: ["Zoroark", "Mienshao", "Gallade"],
        },
        {
          prompt: "This Ghost/Poison Pokémon’s Mega Evolution replaces Levitate with Shadow Tag.",
          level: 3,
          answer: "Gengar",
          card: { name: "Gengar", mode: "art" },
          wrong: ["Haunter", "Banette", "Mismagius"],
        },
        {
          prompt: "This Normal-type artificial Pokémon evolves when traded holding an Upgrade.",
          level: 4,
          answer: "Porygon",
          card: { name: "Porygon", mode: "art" },
          wrong: ["Porygon2", "Porygon-Z", "Ditto"],
        },
        {
          prompt: "This Pokémon evolves from a female Snorunt using a Dawn Stone and becomes Ice/Ghost.",
          level: 5,
          answer: "Froslass",
          card: { name: "Froslass", mode: "art" },
          wrong: ["Glalie", "Glaceon", "Jynx"],
        },
      ],
    },

    {
      name: "Type Trouble",
      note: "Uses the video-game type chart. Ignore abilities.",
      questions: [
        {
          prompt: "This one type deals four-times damage to both Ferrothorn (Grass/Steel) and Scizor (Bug/Steel).",
          level: 2,
          answer: "Fire",
          card: { name: "Scizor", mode: "art-only" },
          wrong: ["Fighting", "Ground", "Flying"],
        },
        {
          prompt: "A Ground-type move hits the Electric/Steel Pokémon Magnezone for this damage multiplier.",
          level: 3,
          answer: "4×",
          card: { name: "Magnezone", mode: "art-only" },
          wrong: ["2×", "½×", "0× (no effect)"],
        },
        {
          prompt: "This is the only type super effective against the Water/Ground Pokémon Swampert.",
          level: 1,
          answer: "Grass",
          card: { name: "Swampert", mode: "art-only" },
          wrong: ["Electric", "Ice", "Water"],
        },
        {
          prompt: "Charizard is Fire/Flying. Which of its weaknesses deals four-times damage?",
          level: 2,
          answer: "Rock",
          card: { name: "Charizard", mode: "art-only" },
          wrong: ["Water", "Electric", "Ice"],
        },
        {
          prompt: "Name all three types that a Ghost/Dark Pokémon is immune to.",
          level: 4,
          answer: "Normal, Fighting, Psychic",
          wrong: ["Normal, Fighting, Ghost", "Normal, Psychic, Poison", "Fighting, Psychic, Dark"],
        },
        {
          prompt: "Name every type that deals super-effective damage to a Dragon/Steel Pokémon like Dialga.",
          level: 5,
          answer: "Fighting and Ground",
          card: { name: "Dialga", mode: "art-only" },
          wrong: ["Fighting, Ground and Dragon", "Fire and Ground", "Fighting, Ground and Fairy"],
        },
      ],
    },

    {
      name: "TCG Decisions",
      note: "Current standard rules, no card effects that change them.",
      questions: [
        // 100
        { level: 1, prompt: "How many cards are in a Pokémon TCG deck?", answer: "60", wrong: ["40", "50", "75"] },
        { level: 1, prompt: "How many Prize cards does each player set aside?", answer: "Six", wrong: ["Four", "Five", "Seven"] },
        { level: 1, prompt: "How many Pokémon can normally sit on your Bench?", answer: "Five", wrong: ["Three", "Four", "Six"] },
        // 200
        {
          level: 2, prompt: "A Pokémon VMAX is Knocked Out. How many Prize cards are taken?", answer: "Three",
          card: { name: "Umbreon VMAX", mode: "art" }, wrong: ["One", "Two", "Four"],
        },
        { level: 2, prompt: "How many Supporter cards can you play each turn?", answer: "One", wrong: ["Two", "Three", "As many as you like"] },
        { level: 2, prompt: "Most cards are limited to how many copies per deck?", answer: "Four", wrong: ["Two", "Three", "Six"] },
        // 300
        { level: 3, prompt: "Your Active Pokémon is Asleep. What can’t it do?", answer: "Attack or retreat", wrong: ["Attack only", "Retreat or use Abilities", "Have Energy attached"] },
        { level: 3, prompt: "You go first. What can’t you do on that turn?", answer: "Attack or play a Supporter", wrong: ["Attach Energy or retreat", "Play an Item or a Stadium", "Use Abilities or retreat"] },
        { level: 3, prompt: "You evolved a Pokémon this turn. What can’t you do to it again?", answer: "Evolve it", wrong: ["Attach Energy to it", "Retreat it", "Use its Ability"] },
        // 400
        {
          level: 4, prompt: "You must draw 7 cards, but only 6 are left. What happens?", answer: "Draw 6 and keep playing",
          card: { name: "Professor's Research", mode: "art" },
          wrong: ["You lose right away", "You can’t play that card", "Shuffle your discards in and draw 7"],
        },
        { level: 4, prompt: "Your opponent mulligans twice. What can you do?", answer: "Draw up to 2 extra cards", wrong: ["Take a Prize card", "Choose who goes first", "Nothing"] },
        { level: 4, prompt: "When does a Paralyzed Active Pokémon recover?", answer: "At the end of its owner’s next turn", wrong: ["At the end of this turn", "On a heads coin flip", "When Energy is attached to it"] },
        // 500
        { level: 5, prompt: "One attack lets both players take their last Prize card. What happens?", answer: "Sudden Death", wrong: ["The attacker wins", "The defending player wins", "The game is a draw"] },
        { level: 5, prompt: "Your Active is Poisoned and Burned. How much damage between turns?", answer: "30", wrong: ["20", "40", "50"] },
        { level: 5, prompt: "Both players hit a win condition at once, but one hits two. Who wins?", answer: "The player with two", wrong: ["Neither: Sudden Death", "The attacking player", "Whoever took a Prize first"] },
      ],
    },

    {
      name: "Collector Knowledge",
      questions: [
        {
          prompt: "A graded card’s “centering” evaluates this feature of its printing.",
          level: 1,
          answer: "How evenly the design sits between the borders",
          wrong: ["How sharp the corners are", "How glossy the holo foil is", "Whether the colors are printed correctly"],
        },
        {
          prompt: "A card graded PSA 10 carries this label.",
          level: 1,
          answer: "Gem Mint",
          wrong: ["Mint", "Near Mint", "Pristine"],
        },
        {
          prompt: "This Sword & Shield set features the Umbreon VMAX alternate-art card nicknamed “Moonbreon.”",
          level: 3,
          answer: "Evolving Skies",
          card: { id: "swsh7-215", mode: "art" },
          wrong: ["Fusion Strike", "Chilling Reign", "Brilliant Stars"],
        },
        {
          prompt: "What distinguishes a traditional holo card from its reverse-holo version?",
          level: 2,
          answer: "Holo: foil in the illustration. Reverse holo: foil outside it",
          wrong: ["Holo: foil outside the illustration. Reverse holo: foil inside it", "Reverse holos only have a foil set symbol", "Reverse holos have foil on the card back"],
        },
        {
          prompt: "These two letters begin collector numbers in Brilliant Stars’ Trainer Gallery subset.",
          level: 4,
          answer: "TG",
          wrong: ["TR", "GG", "SV"],
        },
        {
          prompt: "This English set introduced Gold Star cards, whose illustrations feature Shiny Pokémon.",
          level: 5,
          answer: "EX Team Rocket Returns",
          wrong: ["EX Deoxys", "EX Dragon Frontiers", "EX FireRed & LeafGreen"],
        },
      ],
    },

    {
      name: "Evolution Puzzles",
      questions: [
        {
          prompt: "This baby Pokémon evolves into Pikachu.",
          level: 1,
          answer: "Pichu",
          card: { name: "Pichu", mode: "reveal" },
          wrong: ["Pikipek", "Plusle", "Emolga"],
        },
        {
          prompt: "Name both Pokémon that evolve through trading while holding a Metal Coat.",
          level: 3,
          answer: "Onix and Scyther",
          wrong: ["Onix and Seadra", "Scyther and Magneton", "Onix and Rhydon"],
        },
        {
          prompt: "This Pokémon evolves into Gallade only if it is male and receives a Dawn Stone.",
          level: 3,
          answer: "Kirlia",
          card: { name: "Kirlia", mode: "reveal" },
          wrong: ["Ralts", "Gardevoir", "Snorunt"],
        },
        {
          prompt: "Eevee knows a Fairy-type move and has enough affection or friendship. It evolves into this Pokémon.",
          level: 2,
          answer: "Sylveon",
          card: { name: "Sylveon", mode: "reveal" },
          wrong: ["Espeon", "Umbreon", "Leafeon"],
        },
        {
          prompt: "Tyrogue reaches its evolution level with equal Attack and Defense stats. It becomes this Pokémon.",
          level: 4,
          answer: "Hitmontop",
          card: { name: "Hitmontop", mode: "reveal" },
          wrong: ["Hitmonlee", "Hitmonchan", "Machoke"],
        },
        {
          prompt: "Name all three Pokémon that Clamperl or Feebas can evolve into.",
          level: 5,
          answer: "Huntail, Gorebyss, Milotic",
          wrong: ["Huntail, Gorebyss, Luvdisc", "Huntail, Milotic, Relicanth", "Gorebyss, Milotic, Wailord"],
        },
      ],
    },

    {
      name: "Abilities & Strategy",
      questions: [
        {
          prompt: "When a Pokémon with Intimidate enters battle, it lowers this stat of its opponents.",
          level: 1,
          answer: "Attack",
          wrong: ["Defense", "Speed", "Special Attack"],
        },
        {
          prompt: "This ability raises a Pokémon’s Attack when it has a status condition and avoids the usual burn reduction to physical damage.",
          level: 4,
          answer: "Guts",
          wrong: ["Huge Power", "Marvel Scale", "Quick Feet"],
        },
        {
          prompt: "This ability damages an attacker that makes contact, and is commonly associated with Ferrothorn.",
          level: 5,
          answer: "Iron Barbs",
          wrong: ["Rough Skin", "Static", "Flame Body"],
        },
        {
          prompt: "This ability lets a Pokémon survive a hit at 1 HP if it started at full HP, and blocks one-hit KO moves.",
          level: 3,
          answer: "Sturdy",
          wrong: ["Multiscale", "Shell Armor", "Magic Guard"],
        },
        {
          prompt: "This ability turns Water-type moves used against its user into healing instead of damage.",
          level: 3,
          answer: "Water Absorb",
          wrong: ["Storm Drain", "Rain Dish", "Hydration"],
        },
        {
          prompt: "This ability doubles its user’s Speed in rain.",
          level: 2,
          answer: "Swift Swim",
          wrong: ["Chlorophyll", "Rain Dish", "Sand Rush"],
        },
      ],
    },
  ],

  // Final round: one of these is picked each game. Everyone wagers part of their score,
  // then answers. These should be the hardest questions in the game.
  finals: [
    {
      category: "Build the Matchup",
      prompt: "Name every type that is super effective against Steel/Fairy, like Magearna.",
      answer: "Fire and Ground",
      card: { name: "Magearna", mode: "art-only" },
      wrong: ["Fire, Ground and Fighting", "Fire, Ground and Poison", "Ground and Steel"],
    },
    {
      category: "Build the Matchup",
      prompt: "Name every type that is super effective against Dark/Fairy, like Grimmsnarl.",
      answer: "Fairy, Poison and Steel",
      card: { name: "Grimmsnarl", mode: "art-only" },
      wrong: ["Fighting, Bug and Fairy", "Fairy, Poison and Fighting", "Poison and Steel"],
    },
    {
      category: "Type Trouble",
      prompt: "Which of these Pokémon is NOT four-times weak to Ice?",
      answer: "Kingdra",
      wrong: ["Garchomp", "Salamence", "Gliscor"],
    },
    {
      category: "Evolution Puzzles",
      prompt: "Nincada evolves and Shedinja appears too. What else do you need?",
      answer: "An empty party slot and a spare Poké Ball",
      card: { name: "Shedinja", mode: "reveal" },
      wrong: ["A Dusk Stone in your bag", "A Ghost-type in your party", "To evolve it at night"],
    },
    {
      category: "Evolution Puzzles",
      prompt: "This Pokémon evolves only if you hold your game system upside down as it levels up.",
      answer: "Inkay",
      card: { name: "Malamar", mode: "reveal" },
      wrong: ["Pancham", "Sliggoo", "Tyrunt"],
    },
    {
      category: "Collector Knowledge",
      prompt: "The Pikachu Illustrator card was first awarded through a contest in this magazine.",
      answer: "CoroCoro Comic",
      wrong: ["Nintendo Power", "Weekly Shōnen Jump", "V Jump"],
    },
    {
      category: "Deep Cuts",
      prompt: "This Pokémon is number 1 in Pokémon Red and Blue’s hidden internal index.",
      answer: "Rhydon",
      card: { name: "Rhydon", mode: "reveal" },
      wrong: ["Bulbasaur", "Mew", "Clefairy"],
    },
  ],

  // Tiebreakers: only used if first place is tied after the final. Closest guess wins.
  // A different one is used each time a tiebreaker is replayed.
  tiebreakers: [
    { prompt: "What is Dragonite’s combined base-stat total?", answer: 600 },
    { prompt: "How many cards are in the original English Base Set?", answer: 102 },
    { prompt: "How many pounds does Snorlax weigh?", answer: 1014 },
    { prompt: "What is Mewtwo’s base Special Attack stat?", answer: 154 },
    { prompt: "In what year did the Pokémon TCG first launch in Japan?", answer: 1996 },
  ],
};
