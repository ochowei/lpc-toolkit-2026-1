export interface SeededCase {
  readonly name: string;
  readonly seed: number;
}

export interface FixedHashCase {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
}

export const SEEDED_RANDOM_CASES: readonly SeededCase[] = [
  { name: 'seed-1', seed: 1 },
  { name: 'seed-7', seed: 7 },
  { name: 'seed-42', seed: 42 },
  { name: 'seed-99', seed: 99 },
  { name: 'seed-20260530', seed: 20260530 },
];

export const MINIMAL_PARITY_CASE: FixedHashCase = {
  name: 'minimal-parity-test',
  source: 'Minimal layer combination (body, head, expression) in light color',
  hash: 'sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light',
};

export const OBSERVED_REGRESSION_CASE: FixedHashCase = {
  name: 'observed-deployed-mismatch-2026-05-30',
  source: 'User-reported deployed toolkit vs upstream visual mismatch',
  hash: 'sex=male&body=Body_Color&head=Human_Female&eyes=Cyclops_Eyes&eyebrows=Thin_Eyebrows&nose=Large_nose&ears=Big_ears&ears_inner=Side_Wolf_Ears_Skintone&beard=Medium_Beard&expression=Happy_Alt&expression_crying=Tears&bandana=Bordered_Bandana&bandana_overlay=Skull_Bandana_Overlay&updo=High_Bun&hairextr=Right_Long_Straight&hairtie_rune=Hair_Tie_Rune&facial_mask=Plain_Mask&facial_right=Right_Monocle&facial_right_trim=Right_Monocle_Frame_Color&visor=Narrow_slit_visor&arms=Armour&clothes=Shortsleeve&overalls=Overalls&armour=Legion&chainmail=Chainmail&bracers=Bracers&bauldron=Bauldron&hat=Hood&jacket=Frock_coat&jacket_collar=Frock_collar&jacket_trim=Frock_coat_lapel&vest=Vest&hat_buckle=Wizard_Hat_Buckle&hat_overlay=Bicorne_Athwart_Skull&shoes_toe=Plated_Toe&cape_trim=Cape_Trim&quiver=Quiver&charm=Pearl_Gem&bandages=Bandages&cargo=Wood&gloves=Gloves&necklace=Simple_Necklace&sash=Obi&weapon_magic_crystal=Crystal&shield_paint=Revised_Heater_Shield_Paint&wings=Bat_Wings&wings_dots=Monarch_Wings_Dots&wings_edge=Monarch_Wings_Edge&fins=Fin&furry_ears=Cat_Ears&furry_ears_skin=Cat_Ears_Skintone&tail=Wolf_Tail',
};

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
