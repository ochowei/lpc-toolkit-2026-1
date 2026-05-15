export type TypeName = string;

export type ItemId = string;

export type BodyType = string;

export type AnimationName = string;

export type FilePath = string;

export type License = string;

export interface RawLayer {
  readonly zPos: number;
  readonly custom_animation?: string;
  readonly [bodyType: string]: number | string | undefined;
}

export interface CreditEntry {
  readonly file: FilePath;
  readonly notes: string;
  readonly authors: readonly string[];
  readonly licenses: readonly License[];
  readonly urls: readonly string[];
}

export interface RecolorConfig {
  readonly material: string;
  readonly palettes: unknown;
}

export interface ItemDefinition {
  readonly name: string;
  readonly type_name: TypeName;
  readonly animations: readonly AnimationName[];
  readonly credits: readonly CreditEntry[];
  readonly recolors?: readonly RecolorConfig[];
  readonly variants?: readonly string[];
  readonly tags?: readonly string[];
  readonly required_tags?: readonly string[];
  readonly replace_in_path?: Readonly<Record<TypeName, Readonly<Record<string, string>>>>;
  readonly priority?: number;
  readonly match_body_color?: boolean;
  readonly preview_row?: number;
  readonly preview_column?: number;
  readonly [layerKey: `layer_${number}`]: RawLayer | undefined;
}

export interface Catalog {
  readonly byItemId: ReadonlyMap<ItemId, ItemDefinition>;
  readonly byTypeName: ReadonlyMap<TypeName, readonly ItemDefinition[]>;
  readonly typeNames: readonly TypeName[];
  readonly aliases: ReadonlyMap<TypeName, TypeName>;
}

export interface Selection {
  readonly typeName: TypeName;
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
}

export interface Selections {
  readonly bodyType: BodyType;
  readonly items: Readonly<Record<TypeName, Selection>>;
}

export interface LayerSpec {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly path: FilePath;
  readonly zPos: number;
  readonly customAnimation?: string;
}

export interface CreditsManifest {
  readonly entries: readonly CreditEntry[];
  readonly licenses: readonly License[];
}

export interface ComposedSheet {
  readonly canvas: unknown;
  readonly width: number;
  readonly height: number;
  readonly selections: Selections;
  readonly credits: CreditsManifest;
  readonly layers: readonly LayerSpec[];
  readonly animations: readonly AnimationName[];
}

export interface ComposedAnimation {
  readonly canvas: unknown;
  readonly width: number;
  readonly height: number;
  readonly animation: AnimationName;
  readonly frameCount: number;
  readonly directions: 1 | 4;
  readonly credits: CreditsManifest;
}
