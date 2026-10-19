// The question bank. Edit freely: each question needs a prompt, the right answer,
// and exactly three wrong answers. Options are shuffled every game.
//
// Optional card picture (from the free TCGdex card database):
//   card: { name: "Garchomp", mode: "art" }   looks up a card by exact name (a random printing)
//   card: { id: "swsh7-215", mode: "card" }   one specific card (TCGdex id: set id + card number)
// mode decides when players see it, so the picture never gives the answer away:
//   "art"       artwork only (name, HP and text hidden) while answering, full card on the reveal
//   "art-only"  artwork only, during the question and the reveal
//   "card"      the full card the whole time
//   "reveal"    nothing while answering, the full card on the reveal
// If the card can't be found or loaded, the question just shows without a picture.
//
// Board layout: one column per category, questions top-to-bottom in the order
// written here (easiest first). Six categories of six questions make a 36-card board.
// Point values are randomized every game. Wildcards take the place of questions:
// the host picks how many (0 to 36) and which questions they replace is random.

export const BANK = {
  title: "Pokémon Trivia Board",

  categories: [
    {
      name: "Who’s That Pokémon?",
      questions: [
        {
          prompt: "This Ground/Dragon Pokémon evolves from Gabite and is Cynthia’s signature partner.",
          answer: "Garchomp",
          card: { name: "Garchomp", mode: "art" },
          wrong: ["Salamence", "Flygon", "Haxorus"],
        },
        {
          prompt: "This Ghost/Fairy Pokémon hides under a rag made to look like Pikachu.",
          answer: "Mimikyu",
          card: { name: "Mimikyu", mode: "art" },
          wrong: ["Ditto", "Zorua", "Banette"],
        },
        {
          prompt: "This Pokémon evolves from Riolu through high friendship during the day.",
          answer: "Lucario",
          card: { name: "Lucario", mode: "art" },
          wrong: ["Zoroark", "Mienshao", "Gallade"],
        },
        {
          prompt: "This Ghost/Poison Pokémon’s Mega Evolution replaces Levitate with Shadow Tag.",
          answer: "Gengar",
          card: { name: "Gengar", mode: "art" },
          wrong: ["Haunter", "Banette", "Mismagius"],
        },
        {
          prompt: "This Normal-type artificial Pokémon evolves when traded holding an Upgrade.",
          answer: "Porygon",
          card: { name: "Porygon", mode: "art" },
          wrong: ["Porygon2", "Porygon-Z", "Ditto"],
        },
        {
          prompt: "This Pokémon evolves from a female Snorunt using a Dawn Stone and becomes Ice/Ghost.",
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
          answer: "Fire",
          card: { name: "Scizor", mode: "art-only" },
          wrong: ["Fighting", "Ground", "Flying"],
        },
        {
          prompt: "A Ground-type move hits the Electric/Steel Pokémon Magnezone for this damage multiplier.",
          answer: "4×",
          card: { name: "Magnezone", mode: "art-only" },
          wrong: ["2×", "½×", "0× (no effect)"],
        },
        {
          prompt: "This is the only type super effective against the Water/Ground Pokémon Swampert.",
          answer: "Grass",
          card: { name: "Swampert", mode: "art-only" },
          wrong: ["Electric", "Ice", "Water"],
        },
        {
          prompt: "Charizard is Fire/Flying. Which of its weaknesses deals four-times damage?",
          answer: "Rock",
          card: { name: "Charizard", mode: "art-only" },
          wrong: ["Water", "Electric", "Ice"],
        },
        {
          prompt: "Name all three types that a Ghost/Dark Pokémon is immune to.",
          answer: "Normal, Fighting, Psychic",
          wrong: ["Normal, Fighting, Ghost", "Normal, Psychic, Poison", "Fighting, Psychic, Dark"],
        },
        {
          prompt: "Name every type that deals super-effective damage to a Dragon/Steel Pokémon like Dialga.",
          answer: "Fighting and Ground",
          card: { name: "Dialga", mode: "art-only" },
          wrong: ["Fighting, Ground and Dragon", "Fire and Ground", "Fighting, Ground and Fairy"],
        },
      ],
    },

    {
      name: "TCG Decisions",
      note: "Standard tabletop rules, no card effects that change them.",
      questions: [
        {
          prompt: "How many cards are in a standard Pokémon TCG deck?",
          answer: "60",
          wrong: ["40", "50", "75"],
        },
        {
          prompt: "Your opponent Knocks Out a Pokémon VMAX. How many Prize cards do they normally take?",
          answer: "Three",
          card: { name: "Umbreon VMAX", mode: "card" },
          wrong: ["One", "Two", "Four"],
        },
        {
          prompt: "You must draw seven cards with Professor’s Research, but only six remain in your deck. What happens?",
          answer: "Draw the remaining six; you don’t lose",
          card: { name: "Professor's Research", mode: "card" },
          wrong: ["You lose immediately", "You can’t play Professor’s Research", "Shuffle your discard pile in and draw seven"],
        },
        {
          prompt: "You just evolved a Pokémon this turn. What can’t you normally do to that same Pokémon again this turn?",
          answer: "Evolve it again",
          wrong: ["Attach an Energy to it", "Retreat it", "Use its Ability"],
        },
        {
          prompt: "Your Active Pokémon is Asleep. Which two actions does this prevent it from taking?",
          answer: "Attacking and retreating",
          wrong: ["Attacking only", "Retreating and using Abilities", "Attacking and having Energy attached"],
        },
        {
          prompt: "Your opponent has one Prize card left. Their attack Knocks Out your only Pokémon in play, and recoil Knocks Out their Active Pokémon, letting you take your last Prize card too. Who wins?",
          answer: "Your opponent: they meet two win conditions, you meet one",
          wrong: ["You: you took a Prize card too", "Nobody: it goes to Sudden Death", "Whoever took a Prize card first"],
        },
      ],
    },

    {
      name: "Collector Knowledge",
      questions: [
        {
          prompt: "A graded card’s “centering” evaluates this feature of its printing.",
          answer: "How evenly the design sits between the borders",
          wrong: ["How sharp the corners are", "How glossy the holo foil is", "Whether the colors are printed correctly"],
        },
        {
          prompt: "A card graded PSA 10 carries this label.",
          answer: "Gem Mint",
          wrong: ["Mint", "Near Mint", "Pristine"],
        },
        {
          prompt: "This Sword & Shield set features the Umbreon VMAX alternate-art card nicknamed “Moonbreon.”",
          answer: "Evolving Skies",
          card: { id: "swsh7-215", mode: "card" },
          wrong: ["Fusion Strike", "Chilling Reign", "Brilliant Stars"],
        },
        {
          prompt: "What distinguishes a traditional holo card from its reverse-holo version?",
          answer: "Holo: foil in the illustration. Reverse holo: foil outside it",
          wrong: ["Holo: foil outside the illustration. Reverse holo: foil inside it", "Reverse holos only have a foil set symbol", "Reverse holos have foil on the card back"],
        },
        {
          prompt: "These two letters begin collector numbers in Brilliant Stars’ Trainer Gallery subset.",
          answer: "TG",
          wrong: ["TR", "GG", "SV"],
        },
        {
          prompt: "This English set introduced Gold Star cards, whose illustrations feature Shiny Pokémon.",
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
          answer: "Pichu",
          card: { name: "Pichu", mode: "reveal" },
          wrong: ["Pikipek", "Plusle", "Emolga"],
        },
        {
          prompt: "Name both Pokémon that evolve through trading while holding a Metal Coat.",
          answer: "Onix and Scyther",
          wrong: ["Onix and Seadra", "Scyther and Magneton", "Onix and Rhydon"],
        },
        {
          prompt: "This Pokémon evolves into Gallade only if it is male and receives a Dawn Stone.",
          answer: "Kirlia",
          card: { name: "Kirlia", mode: "reveal" },
          wrong: ["Ralts", "Gardevoir", "Snorunt"],
        },
        {
          prompt: "Eevee knows a Fairy-type move and has enough affection or friendship. It evolves into this Pokémon.",
          answer: "Sylveon",
          card: { name: "Sylveon", mode: "reveal" },
          wrong: ["Espeon", "Umbreon", "Leafeon"],
        },
        {
          prompt: "Tyrogue reaches its evolution level with equal Attack and Defense stats. It becomes this Pokémon.",
          answer: "Hitmontop",
          card: { name: "Hitmontop", mode: "reveal" },
          wrong: ["Hitmonlee", "Hitmonchan", "Machoke"],
        },
        {
          prompt: "Name all three Pokémon that Clamperl or Feebas can evolve into.",
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
          answer: "Attack",
          wrong: ["Defense", "Speed", "Special Attack"],
        },
        {
          prompt: "This ability raises a Pokémon’s Attack when it has a status condition and avoids the usual burn reduction to physical damage.",
          answer: "Guts",
          wrong: ["Huge Power", "Marvel Scale", "Quick Feet"],
        },
        {
          prompt: "This ability damages an attacker that makes contact, and is commonly associated with Ferrothorn.",
          answer: "Iron Barbs",
          wrong: ["Rough Skin", "Static", "Flame Body"],
        },
        {
          prompt: "This ability lets a Pokémon survive a hit at 1 HP if it started at full HP, and blocks one-hit KO moves.",
          answer: "Sturdy",
          wrong: ["Multiscale", "Shell Armor", "Magic Guard"],
        },
        {
          prompt: "This ability turns Water-type moves used against its user into healing instead of damage.",
          answer: "Water Absorb",
          wrong: ["Storm Drain", "Rain Dish", "Hydration"],
        },
        {
          prompt: "This ability doubles its user’s Speed in rain.",
          answer: "Swift Swim",
          wrong: ["Chlorophyll", "Rain Dish", "Sand Rush"],
        },
      ],
    },
  ],

  // Everyone wagers part of their score, then answers.
  final: {
    category: "Build the Matchup",
    prompt: "A Pokémon is Grass/Poison, like Venusaur. Name all four attack types that deal super-effective damage to it.",
    answer: "Fire, Ice, Flying, Psychic",
    card: { name: "Venusaur", mode: "art-only" },
    wrong: ["Fire, Ice, Flying, Ground", "Fire, Ice, Psychic, Bug", "Fire, Flying, Psychic, Ghost"],
  },

  // Only used if first place is tied after the final. Closest guess wins.
  tiebreaker: {
    prompt: "What is Dragonite’s combined base-stat total?",
    answer: 600,
  },
};
