// Realistic LPC catalog content. The LPC project (Liberated Pixel Cup) is a
// permissively licensed community asset library (CC-BY-SA 3.0 / GPL 3.0 / OGA-BY).
// All authors/items below are illustrative of how the catalog is organized.

const BODY_TYPES = [
  { id: 'male',      label: 'Male',      hint: 'Adult masc.' },
  { id: 'female',    label: 'Female',    hint: 'Adult fem.' },
  { id: 'teen',      label: 'Teen',      hint: 'Smaller frame' },
  { id: 'child',     label: 'Child',     hint: 'Compact' },
  { id: 'muscular',  label: 'Muscular',  hint: 'Bulky' },
  { id: 'pregnant',  label: 'Pregnant',  hint: 'Adult fem.' },
];

// Color ramps. Each ramp = [shadow, mid, light, highlight].
const RAMPS = {
  skin_ivory:    { name: 'ivory',    swatches: ['#caa07a','#e3bd95','#f2d6b3','#fde8d1'] },
  skin_tan:      { name: 'tan',      swatches: ['#7a4f30','#a06b3f','#c98f56','#dcae7a'] },
  skin_olive:    { name: 'olive',    swatches: ['#523417','#7a542a','#9c7142','#bb9669'] },
  skin_brown:    { name: 'brown',    swatches: ['#36200f','#4f311a','#6e4625','#8a5d3a'] },
  skin_dark:     { name: 'dark',     swatches: ['#1f110a','#321d0f','#4a2c18','#643f25'] },
  skin_zombie:   { name: 'zombie',   swatches: ['#2e3a23','#506447','#7a8e6a','#a4b48f'] },
  skin_orc:      { name: 'orc',      swatches: ['#244327','#3a6a3a','#5c8e54','#86b078'] },

  hair_black:    { name: 'black',    swatches: ['#0a0a0c','#191921','#2a2a36','#3d3d4d'] },
  hair_brown:    { name: 'brown',    swatches: ['#2a1a0f','#4a2e1a','#6a4525','#8e6238'] },
  hair_blonde:   { name: 'blonde',   swatches: ['#7a5b1a','#b48a2c','#dcb44a','#f0d68a'] },
  hair_ginger:   { name: 'ginger',   swatches: ['#4a1a0a','#7e2a10','#b7461d','#d97a40'] },
  hair_silver:   { name: 'silver',   swatches: ['#4a4e58','#7c8090','#a8acba','#d4d6e0'] },
  hair_white:    { name: 'white',    swatches: ['#9a9a9a','#c4c4c8','#e2e2e8','#fafafa'] },
  hair_red:      { name: 'red',      swatches: ['#4a0a0a','#84121a','#c92a32','#e85c66'] },
  hair_pink:     { name: 'pink',     swatches: ['#7a1a4a','#b62c70','#e26aa6','#f5b1d2'] },
  hair_blue:     { name: 'blue',     swatches: ['#0a1f4a','#1a3a84','#3568c4','#6e9af2'] },
  hair_green:    { name: 'green',    swatches: ['#1a3a0a','#346a14','#5a9c2a','#92c75c'] },
  hair_purple:   { name: 'purple',   swatches: ['#2a0a4a','#4e1a84','#7e3ac0','#b275ec'] },

  cloth_ivory:   { name: 'ivory',    swatches: ['#9c8466','#bca282','#dcc4a0','#f3e2c2'] },
  cloth_white:   { name: 'white',    swatches: ['#8a8a92','#b6b6bc','#dadae0','#f4f4f6'] },
  cloth_black:   { name: 'black',    swatches: ['#08080c','#16161e','#262630','#3a3a48'] },
  cloth_gray:    { name: 'gray',     swatches: ['#2a2c32','#494c56','#6c6f7c','#9498a4'] },
  cloth_red:     { name: 'red',      swatches: ['#4a0a14','#841422','#b6202e','#e04a52'] },
  cloth_blue:    { name: 'blue',     swatches: ['#0a1a4a','#1a3284','#3258c4','#6090ec'] },
  cloth_green:   { name: 'green',    swatches: ['#0a3a1a','#1a5e30','#2e8a4a','#5cb670'] },
  cloth_teal:    { name: 'teal',     swatches: ['#0a3a3a','#14605c','#22908a','#4ec2b8'] },
  cloth_purple:  { name: 'purple',   swatches: ['#26104a','#421a84','#6c34c0','#a872ec'] },
  cloth_yellow:  { name: 'yellow',   swatches: ['#5e4a0a','#a08412','#dcb622','#f4d850'] },
  cloth_orange:  { name: 'orange',   swatches: ['#5e2a0a','#a04812','#dc7022','#f4a050'] },
  cloth_brown:   { name: 'brown',    swatches: ['#2a1a0a','#4e2e18','#76482a','#a06c46'] },

  metal_iron:    { name: 'iron',     swatches: ['#2e3038','#525664','#7c8090','#aab0c0'] },
  metal_steel:   { name: 'steel',    swatches: ['#3a3e4c','#6e7282','#a0a4b4','#d8dae4'] },
  metal_bronze:  { name: 'bronze',   swatches: ['#3a2410','#6c4220','#a0682e','#d49a52'] },
  metal_gold:    { name: 'gold',     swatches: ['#5e3e0a','#a06e16','#dca22e','#f4d068'] },

  eyes_blue:     { name: 'blue',     swatches: ['#0e2a6a','#2454b6','#4a86dc','#86b6f0'] },
  eyes_green:    { name: 'green',    swatches: ['#0e4a1a','#246e2e','#4aa05a','#8ad494'] },
  eyes_brown:    { name: 'brown',    swatches: ['#2e1808','#5a3018','#8a4e2a','#b87a4a'] },
  eyes_gray:     { name: 'gray',     swatches: ['#2c2e36','#525660','#80848e','#b0b4be'] },
  eyes_amber:    { name: 'amber',    swatches: ['#4a2a08','#8a5410','#c4862a','#eab064'] },
};

const LICENSES = {
  'CC-BY-SA 3.0':   { id: 'ccbysa', short: 'CC-BY-SA',   strict: 3 },
  'CC-BY 3.0':      { id: 'ccby',   short: 'CC-BY',      strict: 2 },
  'GPL 3.0':        { id: 'gpl',    short: 'GPL 3.0',    strict: 4 },
  'OGA-BY 3.0':     { id: 'ogaby',  short: 'OGA-BY',     strict: 2 },
  'CC0':            { id: 'cc0',    short: 'CC0',        strict: 1 },
};

// A "category" = a layer slot. Many categories, many items per category.
const CATEGORIES = [
  { id: 'body',       label: 'Body',         icon: 'B', required: true },
  { id: 'head',       label: 'Head',         icon: 'H' },
  { id: 'eyes',       label: 'Eyes',         icon: 'E' },
  { id: 'eyebrows',   label: 'Eyebrows',     icon: 'b' },
  { id: 'nose',       label: 'Nose',         icon: 'N' },
  { id: 'ears',       label: 'Ears',         icon: 'r' },
  { id: 'hair',       label: 'Hair',         icon: 'A' },
  { id: 'facial',     label: 'Facial hair',  icon: 'F' },
  { id: 'expression', label: 'Expression',   icon: 'X' },
  { id: 'neck',       label: 'Neck',         icon: 'n' },
  { id: 'torso',      label: 'Torso',        icon: 'T' },
  { id: 'shoulders',  label: 'Shoulders',    icon: 'S' },
  { id: 'arms',       label: 'Arms',         icon: 'a' },
  { id: 'wrists',     label: 'Wrists',       icon: 'w' },
  { id: 'hands',      label: 'Hands',        icon: 'h' },
  { id: 'legs',       label: 'Legs',         icon: 'L' },
  { id: 'feet',       label: 'Feet',         icon: 'f' },
  { id: 'cape',       label: 'Cape',         icon: 'C' },
  { id: 'belt',       label: 'Belt',         icon: 'l' },
  { id: 'weapon',     label: 'Weapon',       icon: 'W' },
  { id: 'shield',     label: 'Shield',       icon: 'D' },
  { id: 'quiver',     label: 'Quiver',       icon: 'q' },
  { id: 'backpack',   label: 'Backpack',     icon: 'k' },
];

// Curated catalog. Each item: { id, name, variants?, palette, author, license }.
// Palette is a key in RAMPS that defines which ramp group it accepts.
const ITEMS = {
  body: [
    { id: 'human',       name: 'Human',       palette: 'skin', author: 'Stephen Challener', license: 'OGA-BY 3.0', src: 'opengameart.org/u/redshrike' },
    { id: 'orc',         name: 'Orc',         palette: 'skin', author: 'Skyler Robert Colladay', license: 'CC-BY-SA 3.0', src: 'opengameart.org/u/eskerata' },
    { id: 'skeleton',    name: 'Skeleton',    palette: 'skin', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0', src: 'opengameart.org/u/jaidyn' },
    { id: 'zombie',      name: 'Zombie',      palette: 'skin', author: 'Manuel Riecke', license: 'CC-BY-SA 3.0', src: 'opengameart.org/u/sauer2' },
    { id: 'lizardfolk',  name: 'Lizardfolk',  palette: 'skin', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0', src: 'opengameart.org/u/bluecarrot16' },
  ],
  head: [
    { id: 'human_male',   name: 'Human (m)', palette: 'skin', author: 'Stephen Challener', license: 'OGA-BY 3.0', src: 'opengameart.org/u/redshrike' },
    { id: 'human_female', name: 'Human (f)', palette: 'skin', author: 'Stephen Challener', license: 'OGA-BY 3.0', src: 'opengameart.org/u/redshrike' },
    { id: 'goblin',       name: 'Goblin',    palette: 'skin', author: 'bluecarrot16',     license: 'CC-BY-SA 3.0' },
    { id: 'elven',        name: 'Elven',     palette: 'skin', author: 'JaidynReiman',     license: 'CC-BY-SA 3.0' },
    { id: 'minotaur',     name: 'Minotaur',  palette: 'skin', author: 'bluecarrot16',     license: 'CC-BY-SA 3.0' },
    { id: 'wolfkin',      name: 'Wolfkin',   palette: 'skin', author: 'Tracy Detuncq',    license: 'CC-BY-SA 3.0' },
  ],
  eyes: [
    { id: 'normal',  name: 'Normal',  palette: 'eyes', author: 'Stephen Challener', license: 'OGA-BY 3.0' },
    { id: 'narrow',  name: 'Narrow',  palette: 'eyes', author: 'JaidynReiman',      license: 'CC-BY-SA 3.0' },
    { id: 'large',   name: 'Large',   palette: 'eyes', author: 'bluecarrot16',      license: 'CC-BY-SA 3.0' },
    { id: 'cyclops', name: 'Cyclops', palette: 'eyes', author: 'Manuel Riecke',     license: 'CC-BY-SA 3.0' },
  ],
  eyebrows: [
    { id: 'thick',  name: 'Thick',  palette: 'hair', author: 'Manuel Riecke', license: 'CC-BY-SA 3.0' },
    { id: 'thin',   name: 'Thin',   palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
    { id: 'angled', name: 'Angled', palette: 'hair', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
  ],
  nose: [
    { id: 'button', name: 'Button',     palette: 'skin', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'big',    name: 'Big',        palette: 'skin', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'aquiline', name: 'Aquiline', palette: 'skin', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
  ],
  ears: [
    { id: 'human',   name: 'Human',     palette: 'skin', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'elven',   name: 'Elven',     palette: 'skin', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'pointed', name: 'Pointed',   palette: 'skin', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
  ],
  hair: [
    { id: 'bangs',       name: 'Bangs',         variants: ['short','long'], palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
    { id: 'bedhead',     name: 'Bedhead',       palette: 'hair', author: 'Manuel Riecke', license: 'CC-BY-SA 3.0' },
    { id: 'bunches',     name: 'Bunches',       palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
    { id: 'buns',        name: 'Buns',          palette: 'hair', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'curly',       name: 'Curly',         palette: 'hair', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'long',        name: 'Long',          variants: ['straight','wavy','braided'], palette: 'hair', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'pixie',       name: 'Pixie',         palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
    { id: 'plain',       name: 'Plain',         palette: 'hair', author: 'Stephen Challener', license: 'OGA-BY 3.0' },
    { id: 'ponytail',    name: 'Ponytail',      variants: ['low','high','side'], palette: 'hair', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'shoulderlen', name: 'Shoulder len.', palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
    { id: 'spiked',      name: 'Spiked',        palette: 'hair', author: 'Manuel Riecke', license: 'CC-BY-SA 3.0' },
    { id: 'swoop',       name: 'Swoop',         palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
    { id: 'mohawk',      name: 'Mohawk',        palette: 'hair', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'topknot',     name: 'Topknot',       palette: 'hair', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'page',        name: 'Page',          palette: 'hair', author: 'Stephen Challener', license: 'OGA-BY 3.0' },
    { id: 'mop',         name: 'Mop',           palette: 'hair', author: 'JaidynReiman',  license: 'CC-BY-SA 3.0' },
  ],
  facial: [
    { id: 'none',       name: 'None',       palette: 'hair', author: '—',              license: 'CC0' },
    { id: 'stubble',    name: 'Stubble',    palette: 'hair', author: 'Manuel Riecke',  license: 'CC-BY-SA 3.0' },
    { id: 'goatee',     name: 'Goatee',     palette: 'hair', author: 'Manuel Riecke',  license: 'CC-BY-SA 3.0' },
    { id: 'mustache',   name: 'Mustache',   palette: 'hair', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
    { id: 'full',       name: 'Full beard', variants: ['short','medium','long'], palette: 'hair', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'sideburns',  name: 'Sideburns',  palette: 'hair', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
  ],
  expression: [
    { id: 'neutral',  name: 'Neutral',  palette: null, author: '—', license: 'CC0' },
    { id: 'smile',    name: 'Smile',    palette: null, author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'frown',    name: 'Frown',    palette: null, author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'angry',    name: 'Angry',    palette: null, author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'surprise', name: 'Surprise', palette: null, author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'wink',     name: 'Wink',     palette: null, author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
  ],
  neck: [
    { id: 'scarf',    name: 'Scarf',    palette: 'cloth', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
    { id: 'amulet',   name: 'Amulet',   palette: 'metal', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
    { id: 'collar',   name: 'Collar',   palette: 'metal', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
  ],
  torso: [
    { id: 'shirt',        name: 'Shirt',        variants: ['short','long','sleeveless'], palette: 'cloth', author: 'Stephen Challener', license: 'OGA-BY 3.0' },
    { id: 'tunic',        name: 'Tunic',        variants: ['plain','laced'], palette: 'cloth', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'robe',         name: 'Robe',         variants: ['mage','priest','dark'], palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'chainmail',    name: 'Chainmail',    palette: 'metal', author: 'Matthew Krohn',    license: 'GPL 3.0' },
    { id: 'leather',      name: 'Leather armor',palette: 'cloth', author: 'bluecarrot16',     license: 'CC-BY-SA 3.0' },
    { id: 'plate',        name: 'Plate armor',  palette: 'metal', author: 'Matthew Krohn',    license: 'GPL 3.0' },
    { id: 'corset',       name: 'Corset',       palette: 'cloth', author: 'JaidynReiman',     license: 'CC-BY-SA 3.0' },
    { id: 'jacket',       name: 'Jacket',       palette: 'cloth', author: 'bluecarrot16',     license: 'CC-BY-SA 3.0' },
    { id: 'vest',         name: 'Vest',         palette: 'cloth', author: 'bluecarrot16',     license: 'CC-BY-SA 3.0' },
    { id: 'overcoat',     name: 'Overcoat',     palette: 'cloth', author: 'JaidynReiman',     license: 'CC-BY-SA 3.0' },
  ],
  shoulders: [
    { id: 'pauldron',  name: 'Pauldron',  palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
    { id: 'mantle',    name: 'Mantle',    palette: 'cloth', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'bauldron',  name: 'Bauldron',  palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
  ],
  arms: [
    { id: 'bracers',  name: 'Bracers',  palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
    { id: 'armor',    name: 'Armor',    palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
    { id: 'sleeves',  name: 'Sleeves',  palette: 'cloth', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
  ],
  wrists: [
    { id: 'bracelets',  name: 'Bracelets', palette: 'metal', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
    { id: 'cuffs',      name: 'Cuffs',     palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
  ],
  hands: [
    { id: 'gloves',  name: 'Gloves',  palette: 'cloth', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'gauntlets', name: 'Gauntlets', palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
  ],
  legs: [
    { id: 'pants',   name: 'Pants',    variants: ['plain','baggy','tight'], palette: 'cloth', author: 'Stephen Challener', license: 'OGA-BY 3.0' },
    { id: 'skirt',   name: 'Skirt',    variants: ['short','long','pleated'], palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'shorts',  name: 'Shorts',   palette: 'cloth', author: 'bluecarrot16',  license: 'CC-BY-SA 3.0' },
    { id: 'legarm',  name: 'Leg armor',palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
  ],
  feet: [
    { id: 'shoes',     name: 'Shoes',     palette: 'cloth', author: 'Stephen Challener', license: 'OGA-BY 3.0' },
    { id: 'boots',     name: 'Boots',     variants: ['plain','tall','folded'], palette: 'cloth', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
    { id: 'sandals',   name: 'Sandals',   palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'metal',     name: 'Greaves',   palette: 'metal', author: 'Matthew Krohn', license: 'GPL 3.0' },
  ],
  cape: [
    { id: 'short',  name: 'Short cape',  palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'long',   name: 'Long cape',   palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'tattered', name: 'Tattered',  palette: 'cloth', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
  ],
  belt: [
    { id: 'leather',  name: 'Leather',   palette: 'cloth', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
    { id: 'sash',     name: 'Sash',      palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'rope',     name: 'Rope',      palette: 'cloth', author: 'bluecarrot16', license: 'CC-BY-SA 3.0' },
  ],
  weapon: [
    { id: 'sword',     name: 'Sword',     variants: ['short','long','katana','rapier'], palette: 'metal', author: 'Johannes Sjölund', license: 'CC-BY-SA 3.0' },
    { id: 'dagger',    name: 'Dagger',    palette: 'metal', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
    { id: 'axe',       name: 'Axe',       variants: ['hand','battle','two-handed'], palette: 'metal', author: 'Johannes Sjölund', license: 'CC-BY-SA 3.0' },
    { id: 'mace',      name: 'Mace',      palette: 'metal', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
    { id: 'spear',     name: 'Spear',     palette: 'metal', author: 'Johannes Sjölund', license: 'CC-BY-SA 3.0' },
    { id: 'bow',       name: 'Bow',       variants: ['short','long','recurve'], palette: 'cloth', author: 'JaidynReiman', license: 'CC-BY-SA 3.0' },
    { id: 'crossbow',  name: 'Crossbow',  palette: 'cloth', author: 'JaidynReiman',   license: 'CC-BY-SA 3.0' },
    { id: 'staff',     name: 'Staff',     palette: 'cloth', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
    { id: 'wand',      name: 'Wand',      palette: 'cloth', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
    { id: 'pickaxe',   name: 'Pickaxe',   palette: 'metal', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
  ],
  shield: [
    { id: 'buckler',   name: 'Buckler',   palette: 'metal', author: 'Matthew Krohn',  license: 'GPL 3.0' },
    { id: 'kite',      name: 'Kite',      palette: 'metal', author: 'Matthew Krohn',  license: 'GPL 3.0' },
    { id: 'tower',     name: 'Tower',     palette: 'metal', author: 'Matthew Krohn',  license: 'GPL 3.0' },
    { id: 'round',     name: 'Round',     palette: 'metal', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
  ],
  quiver: [
    { id: 'leather',   name: 'Leather',   palette: 'cloth', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
  ],
  backpack: [
    { id: 'small',     name: 'Small',     palette: 'cloth', author: 'bluecarrot16',   license: 'CC-BY-SA 3.0' },
    { id: 'rucksack',  name: 'Rucksack',  palette: 'cloth', author: 'JaidynReiman',   license: 'CC-BY-SA 3.0' },
  ],
};

const ANIMATIONS = [
  { id: 'idle',    label: 'Idle',    frames: 2,  fps: 4  },
  { id: 'walk',    label: 'Walk',    frames: 8,  fps: 8  },
  { id: 'run',     label: 'Run',     frames: 8,  fps: 12 },
  { id: 'jump',    label: 'Jump',    frames: 5,  fps: 10 },
  { id: 'slash',   label: 'Slash',   frames: 6,  fps: 12 },
  { id: 'thrust',  label: 'Thrust',  frames: 8,  fps: 10 },
  { id: 'cast',    label: 'Cast',    frames: 7,  fps: 8  },
  { id: 'shoot',   label: 'Shoot',   frames: 13, fps: 14 },
  { id: 'hurt',    label: 'Hurt',    frames: 6,  fps: 8  },
  { id: 'climb',   label: 'Climb',   frames: 6,  fps: 6  },
  { id: 'sit',     label: 'Sit',     frames: 1,  fps: 1  },
  { id: 'emote',   label: 'Emote',   frames: 3,  fps: 4  },
];

// Map palette key to ramp options
const PALETTE_OPTIONS = {
  skin:  ['skin_ivory','skin_tan','skin_olive','skin_brown','skin_dark','skin_zombie','skin_orc'],
  hair:  ['hair_black','hair_brown','hair_blonde','hair_ginger','hair_silver','hair_white','hair_red','hair_pink','hair_blue','hair_green','hair_purple'],
  cloth: ['cloth_ivory','cloth_white','cloth_black','cloth_gray','cloth_red','cloth_blue','cloth_green','cloth_teal','cloth_purple','cloth_yellow','cloth_orange','cloth_brown'],
  metal: ['metal_iron','metal_steel','metal_bronze','metal_gold'],
  eyes:  ['eyes_blue','eyes_green','eyes_brown','eyes_gray','eyes_amber'],
};

window.LPC_DATA = {
  BODY_TYPES, RAMPS, LICENSES, CATEGORIES, ITEMS, ANIMATIONS, PALETTE_OPTIONS,
};
