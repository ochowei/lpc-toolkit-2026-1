/**
 * @module @lpc-toolkit/core
 *
 * The pure TypeScript core library for the Liberated Pixel Cup (LPC) character sprite toolkit.
 * Contains core composition, animation parsing, palette recoloring, and credit attribution logic.
 *
 * Strictly environment-agnostic. All I/O, canvas operations, and image loading are abstracted via
 * `CanvasAdapter` and must be provided by the caller.
 */

// ==========================================
// 1. Foundation Types and Definitions
// ==========================================
export type {
  AliasEntry,
  AnimationName,
  BodyType,
  Catalog,
  ColorChannelLink,
  ComposedAnimation,
  ComposedSheet,
  CreditEntry,
  CreditsManifest,
  CustomAnimationRegion,
  FilePath,
  ItemDefinition,
  ItemId,
  LayerSpec,
  License,
  MultiRecolorConfig,
  PaletteColors,
  PaletteMap,
  PaletteMaterialMeta,
  PaletteMetadata,
  PaletteVersionColors,
  PaletteVersionMeta,
  RawLayer,
  RawRecolors,
  RecolorConfig,
  Selection,
  Selections,
  TypeName,
} from './types.js';

// ==========================================
// 2. Environment-Agnostic Adapters
// ==========================================
export type {
  CanvasAdapter,
  CanvasLike,
  Context2DLike,
  ImageDataLike,
  ImageLike,
} from './adapters.js';

// ==========================================
// 3. Functional Error Handling
// ==========================================
export type { Result } from './result.js';
export { ok, err, isOk, isErr, unwrapOr } from './result.js';

// ==========================================
// 4. Sprite and Metadata Catalog Loader
// ==========================================
export type { CatalogLoadWarning, CreateCatalogResult } from './catalog.js';
export { createCatalog } from './catalog.js';

export type {
  AssetPackAcknowledgement,
  AssetPackAssetSource,
  AssetPackCompatibilitySource,
  AssetPackCreditSource,
  AssetPackDiagnostic,
  AssetPackDiagnosticCode,
  AssetPackParseResult,
  AssetPackReplacementSource,
  AssetPackSource,
  AssetPackStatus,
  ExtendItemAnimationSource,
  ExtendItemAssetSource,
  ExtendItemDestinationSource,
  ExtendItemLayerSource,
  NewItemAssetSource,
  NewItemLayerSource,
  NewItemSpriteSource,
} from './asset-pack-schema.js';
export {
  ASSET_PACK_SCHEMA,
  parseAssetPackSource,
} from './asset-pack-schema.js';
export {
  assetPackCreditProjection,
  assetPackDefinitionProjection,
} from './asset-pack-baseline.js';

export type {
  AssetAuthoringBlankFramesFinding,
  AssetAuthoringConsent,
  AssetAuthoringDiagnostic,
  AssetAuthoringDiagnosticCode,
  AssetAuthoringIntent,
  AssetAuthoringLayerIntent,
  AssetAuthoringMissingFileFinding,
  AssetAuthoringPackIntent,
  AssetAuthoringPathConfidence,
  AssetAuthoringPlan,
  AssetAuthoringPlanGoal,
  AssetAuthoringPlanParseResult,
  AssetAuthoringProviderMetadata,
  AssetAuthoringRemediationEvidence,
  AssetAuthoringSelectedFinding,
  AssetAuthoringSourceCell,
  AssetAuthoringUnsupportedFinding,
  AssetAuthoringUnsupportedRequirement,
  AssetAuthoringWorkScope,
  AttachPackAuthoringIntent,
  AttachPackAssetAuthoringPlan,
  ExtendItemAuthoringIntent,
  ExtendItemAssetAuthoringPlan,
  NewItemAuthoringIntent,
  NewItemAssetAuthoringPlan,
} from './asset-authoring-schema.js';
export {
  ASSET_AUTHORING_PLAN_SCHEMA,
  parseAssetAuthoringPlan,
} from './asset-authoring-schema.js';
export type {
  AuthoringIntelligenceCandidateOperationKind,
  AuthoringIntelligenceCatalogCandidate,
  AuthoringIntelligenceCatalogSnapshot,
  AuthoringIntelligenceCatalogSnapshotItem,
  AuthoringIntelligenceDigestProjection,
  AuthoringIntelligenceExplicitHints,
  AuthoringIntelligenceCustomGeometryParameters,
  AuthoringIntelligenceLayerOperation,
  AuthoringIntelligenceMultiLayerParameters,
  AuthoringIntelligenceNormalizedIntent,
  AuthoringIntelligenceOperationKind,
  AuthoringIntelligenceOperationDiagnostic,
  AuthoringIntelligenceOperationParameters,
  AuthoringIntelligenceOperationPlan,
  AuthoringIntelligenceOperationPlanInput,
  AuthoringIntelligenceParseDiagnostic,
  AuthoringIntelligenceParseResult,
  AuthoringIntelligenceRecolorParameters,
  AuthoringIntelligenceRecoveryAction,
  AuthoringIntelligenceRefusal,
  AuthoringIntelligenceRefusalCode,
  AuthoringIntelligenceRequest,
  AuthoringIntelligenceRequestInput,
  AuthoringIntelligenceRoute,
  AuthoringIntelligenceRouteInput,
  AuthoringIntelligenceRouteOutcome,
  AuthoringIntelligenceSessionScope,
  AuthoringIntelligenceVariantParameters,
  SpriteDrawingContractV2,
  SpriteDrawingContractV2Cell,
  SpriteDrawingContractV2CellPolicy,
  SpriteDrawingContractV2Layer,
  SpriteDrawingContractV2Target,
} from './asset-authoring-intelligence.js';
export {
  ASSET_AUTHORING_INTELLIGENCE_CAPABILITIES,
  ASSET_AUTHORING_INTELLIGENCE_CATALOG_SNAPSHOT_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_LIMITS,
  ASSET_AUTHORING_INTELLIGENCE_OPERATION_PLAN_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_CANDIDATE_OPERATION_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_CANDIDATE_SET_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_RECEIPT_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_REQUEST_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_ROUTE_SCHEMA,
  ASSET_AUTHORING_INTELLIGENCE_SCHEMA_VERSIONS,
  SPRITE_DRAWING_CONTRACT_V2_SCHEMA,
  authoringIntelligenceOperationDigestInput,
  authoringIntelligenceOperationProjection,
  authoringIntelligenceRequestDigestInput,
  authoringIntelligenceRouteProjection,
  createAuthoringIntelligenceOperationPlan,
  createAuthoringIntelligenceRequest,
  isAuthoringIntelligenceDigest,
  isAuthoringIntelligenceRecoveryAction,
  isPortableAuthoringIntelligenceId,
  materializeAuthoringIntelligenceRecolor,
  normalizeAuthoringIntelligenceRequestText,
  parseAuthoringIntelligenceCatalogSnapshot,
  routeAuthoringIntelligence,
  spriteDrawingContractV2DigestInput,
  validateAuthoringIntelligenceOperationPlan,
  validateSpriteDrawingContractV2,
} from './asset-authoring-intelligence.js';
export type {
  AssetAuthoringWebHandoffReceipt,
  AssetAuthoringWebHandoffReceiptParseResult,
  AssetWebCliHandoff,
  AssetWebCliHandoffArchiveKind,
  AssetWebCliHandoffDiagnostic,
  AssetWebCliHandoffDiagnosticCode,
  AssetWebCliHandoffParseResult,
  AssetWebCliHandoffStateProjection,
  AssetWebCliHandoffSource,
} from './asset-authoring-web-handoff.js';
export {
  ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
  ASSET_WEB_CLI_HANDOFF_CAPABILITIES,
  ASSET_WEB_CLI_HANDOFF_SCHEMA,
  assetAuthoringWebHandoffReceiptDigestInput,
  assetAuthoringWebHandoffReceiptProjection,
  assetWebCliHandoffAttributionIsRequired,
  assetWebCliCapabilitiesCompatible,
  assetWebCliCapabilitiesMissing,
  assetWebCliHandoffDigestInput,
  assetWebCliHandoffPrivacyIsSafe,
  assetWebCliHandoffStateDigestInput,
  assetWebCliHandoffStateIsStale,
  assetWebCliHandoffStateProjection,
  parseAssetAuthoringWebHandoffReceipt,
  parseAssetAuthoringWebHandoffReceiptJson,
  parseAssetWebCliHandoff,
  parseAssetWebCliHandoffJson,
} from './asset-authoring-web-handoff.js';
export type {
  AssetAuthoringPreviewAcceptanceReceipt,
  AssetAuthoringReleaseArtifactDigest,
  AssetAuthoringReleaseArtifactId,
  AssetAuthoringReleaseDeclarationReceipt,
  AssetAuthoringReleaseGate,
  AssetAuthoringReleaseGateFreshness,
  AssetAuthoringReleaseGateId,
  AssetAuthoringReleaseGateProjection,
  AssetAuthoringReleaseGateProjectionInput,
  AssetAuthoringReleaseReceipt,
  AssetAuthoringReleaseReceiptParseResult,
  AssetReleaseDeclaration,
  AssetReleaseDeclarationParseResult,
  AssetReleaseDeclarant,
  AssetReleaseDeclarantKind,
  AssetReleaseAcknowledgementEvidence,
  AssetReleaseDiagnostic,
  AssetReleaseSourceDigest,
} from './asset-release-schema.js';
export {
  ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
  ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
  ASSET_RELEASE_DECLARATION_SCHEMA,
  assetAuthoringReleaseGateProjection,
  assetAuthoringReleaseReceiptDigestInput,
  assetAuthoringReleaseReceiptProjection,
  assetReleaseDeclarationDigestInput,
  assetReleaseDeclarationProjection,
  parseAssetAuthoringReleaseReceipt,
  parseAssetReleaseDeclaration,
} from './asset-release-schema.js';

export type {
  AssetReleaseProvenanceArtifactDigest,
  AssetReleaseProvenanceDiagnostic,
  AssetReleaseProvenanceDiagnosticCode,
  AssetReleaseProvenanceDigestBinding,
  AssetReleaseProvenanceExternalInput,
  AssetReleaseProvenanceOperation,
  AssetReleaseProvenancePackIdentity,
  AssetReleaseProvenanceParseResult,
  AssetReleaseProvenanceProviderIdentifier,
  AssetReleaseProvenanceProviderOutput,
  AssetReleaseProvenanceProjection,
  AssetReleaseProvenanceRecord,
  AssetReleaseProvenanceReleaseBindings,
  AssetReleaseProvenanceReceipt,
  AssetReleaseProvenanceSourceTransformation,
} from './asset-release-provenance-schema.js';
export {
  ASSET_RELEASE_PROVENANCE_SCHEMA,
  assetReleaseProvenanceProjection,
  assetReleaseProvenanceProjectionDigestInput,
  parseAssetReleaseProvenance,
} from './asset-release-provenance-schema.js';

export type {
  AssetProviderDescriptor,
  AssetProviderDescriptorAdapter,
  AssetProviderDescriptorLimits,
  AssetProviderDescriptorParseResult,
  AssetProviderDiagnostic,
  AssetProviderDiagnosticCode,
  AssetProviderAvailability,
  AgentIntegrationManifest,
  AgentIntegrationManifestParseResult,
  AgentIntegrationCompatibility,
  AgentIntegrationCompatibilityInput,
  AgentIntegrationProviderAdapter,
  AgentIntegrationSupportedGoal,
  AssetProviderConsent,
  AssetProviderDiscovery,
  AssetProviderDiscoveryEntry,
  AssetProviderDiscoveryEntryInput,
  AssetProviderDiscoveryRefusal,
  AssetProviderDiscoveryStatus,
  AssetProviderDiscoveryParseResult,
  AssetProviderIdentity,
  AssetProviderInvocation,
  AssetProviderInvocationCandidate,
  AssetProviderInvocationLimits,
  AssetProviderInvocationParseResult,
  AssetProviderNextAction,
  AssetProviderParseResult,
  AssetProviderRefusal,
  AssetProviderRefusalParseResult,
  AssetProviderResult,
  AssetProviderResultCandidate,
  AssetProviderResultParseResult,
  AssetProviderSemver,
  AssetProviderSemverComparator,
  AssetProviderSemverComparatorOperator,
  AssetProviderSemverRange,
} from './asset-provider-schema.js';
export {
  AGENT_INTEGRATION_MANIFEST_SCHEMA,
  ASSET_PROVIDER_CAPABILITIES,
  ASSET_PROVIDER_CONTRACT_VERSION,
  ASSET_PROVIDER_DESCRIPTOR_SCHEMA,
  ASSET_PROVIDER_DISCOVERY_SCHEMA,
  ASSET_PROVIDER_INVOCATION_SCHEMA,
  ASSET_PROVIDER_LIMITS,
  ASSET_PROVIDER_OPERATION,
  ASSET_PROVIDER_REFUSAL_CODES,
  ASSET_PROVIDER_REFUSAL_SCHEMA,
  ASSET_PROVIDER_RESULT_SCHEMA,
  agentIntegrationManifestDigestInput,
  agentIntegrationManifestCompatibility,
  agentIntegrationManifestProjection,
  assetProviderCliRangeMatches,
  compareAssetProviderSemver,
  assetProviderDescriptorDigestInput,
  assetProviderDescriptorProjection,
  assetProviderDiscoveryDigestInput,
  assetProviderDiscoveryEntry,
  assetProviderDiscoveryProjection,
  assetProviderInvocationDigestInput,
  assetProviderInvocationProjection,
  assetProviderRefusalBindingDiagnostics,
  assetProviderRefusalDigestInput,
  assetProviderRefusalProjection,
  assetProviderResultBindingDiagnostics,
  assetProviderResultDigestInput,
  assetProviderResultProjection,
  parseAssetProviderCliRange,
  parseAssetProviderDescriptor,
  parseAssetProviderDescriptorJson,
  parseAssetProviderDiscovery,
  parseAssetProviderInvocation,
  parseAssetProviderRefusal,
  parseAssetProviderResult,
  parseAssetProviderSemver,
  parseAgentIntegrationManifest,
} from './asset-provider-schema.js';
export type { AssetProviderProvenanceProjectionResult } from './asset-provider-provenance.js';
export { assetProviderResultToReleaseProvenanceRecord } from './asset-provider-provenance.js';

export type {
  AssetDistributionDiagnostic,
  AssetDistributionDiagnosticCode,
  AssetDistributionDigestBinding,
  AssetDistributionRelease,
  AssetDistributionReleaseAuthorization,
  AssetDistributionReleaseIdentity,
  AssetDistributionReleaseParseResult,
  AssetDistributionReleaseSignature,
  AssetDistributionSignatureAlgorithm,
  AssetDistributionSignedProjection,
} from './asset-distribution-schema.js';
export {
  ASSET_DISTRIBUTION_RELEASE_SCHEMA,
  ASSET_DISTRIBUTION_SIGNATURE_ALGORITHM,
  assetDistributionSignedProjection,
  assetDistributionSignedProjectionDigestInput,
  parseAssetDistributionRelease,
} from './asset-distribution-schema.js';
export type {
  AssetDistributionSignatureSigner,
  AssetDistributionSignatureSigningInput,
  AssetDistributionSignatureSigningResult,
  AssetDistributionSignatureVerificationInput,
  AssetDistributionSignatureVerificationResult,
  AssetDistributionSignatureVerifier,
  AssetDistributionTrustDecision,
  AssetDistributionTrustEvaluationInput,
  AssetDistributionTrustKey,
  AssetDistributionTrustKeyStatus,
  AssetDistributionTrustPolicy,
  AssetDistributionTrustPolicyParseResult,
  AssetDistributionTrustStatus,
} from './asset-distribution-trust.js';
export {
  ASSET_DISTRIBUTION_TRUST_POLICY_SCHEMA,
  assetDistributionTrustPolicyDigestInput,
  evaluateAssetDistributionTrust,
  parseAssetDistributionTrustPolicy,
  signAssetDistributionRelease,
  verifyAssetDistributionSignature,
} from './asset-distribution-trust.js';

export type {
  AssetPackCreditRecord,
  NormalizedAssetPack,
  NormalizedAssetPackAsset,
  NormalizedAssetPackCompatibility,
  NormalizedAssetPackReplacement,
  NormalizedExtendItemAnimation,
  NormalizedExtendItemAsset,
  NormalizedExtendItemDestination,
  NormalizedExtendItemLayer,
  NormalizedNewItemAsset,
  NormalizedNewItemLayer,
  NormalizedNewItemSprite,
} from './asset-pack-model.js';
export {
  assetPackContentProjection,
  assetPackItemId,
  assetPackSourceFromNormalized,
  normalizeAssetPack,
  warningAcknowledged,
} from './asset-pack-model.js';
export type { AssetPackSemver } from './asset-pack-version.js';
export {
  assetPackAssetKeys,
  assetPackLifecycleReplacementAllows,
  assetPackVersionRangeMatches,
  compareAssetPackVersions,
  parseAssetPackSemver,
} from './asset-pack-version.js';
export type {
  AssetPackBaseline,
  AssetPackSourceInspection,
  AssetPackValidationResult,
  ValidateAssetPackOptions,
} from './asset-pack-validation.js';
export { validateAssetPack } from './asset-pack-validation.js';
export type {
  AssetPackCompilePlan,
  CompileAssetPacksOptions,
  CompiledAssetDefinition,
  CompiledAssetOwnership,
  CompiledAssetSprite,
  CompiledAssetSpriteConsumer,
} from './asset-pack-compile.js';
export { compileAssetPacks } from './asset-pack-compile.js';

// ==========================================
// 5. Palette and Color Metadata Catalog
// ==========================================
export type {
  CreatePaletteCatalogResult,
  PaletteLoadWarning,
} from './palettes.js';
export { createPaletteCatalog } from './palettes.js';

// ==========================================
// 6. Recolor SWATCHES and Variant Resolvers
// ==========================================
export type {
  MakeResolvePaletteOptions,
  RecolorChannel,
  RecolorSwatch,
  ResolvePalette,
} from './recolor-resolve.js';
export {
  getColorChannels,
  getRecolorSwatches,
  getRecolorVariants,
  getRecolorVariantsForType,
  itemSupportsSelectionType,
  makeResolvePalette,
  primaryColorFollowsBody,
} from './recolor-resolve.js';
export { getDefaultColorSelection } from './selection-defaults.js';

// ==========================================
// 7. Layer Composition Engine
// ==========================================
export type { ComposeOptions, SpritePathResolutionOptions } from './compose.js';
export { composeSelections, getSpritePathsForSelections } from './compose.js';

// ==========================================
// 8. License & Credit Attribution Engine
// ==========================================
export { getCredits, computeEffectiveLicense } from './credits.js';
export { creditsToTxt, creditsToCsv } from './credits-format.js';

// ==========================================
// 9. Selection URL State Serializer
// ==========================================
export type {
  ParsedSelectionJson,
  SelectionSchema,
  SelectionJson,
  SelectionJsonItem,
} from './selection-document.js';
export {
  parseSelectionJson,
  SelectionJsonError,
  SELECTION_SCHEMA,
  SELECTION_SCHEMA_V1,
  SELECTION_SCHEMA_V2,
  selectionJsonFromCore,
} from './selection-document.js';
export type {
  ImportedSelectionDocument,
  SelectionDocumentErrorCode,
  SelectionDocumentImportContext,
  SelectionDocumentSource,
} from './upstream-selection-import.js';
export {
  importSelectionDocument,
  SelectionDocumentError,
} from './upstream-selection-import.js';
export type {
  HashWarning,
  ParseHashResult,
  UpstreamHashResult,
  UpstreamProjectionLoss,
} from './hash.js';
export {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  serializeHash,
  serializeLegacyHash,
  serializeUpstreamHash,
} from './hash.js';

// ==========================================
// 10. Animation Strip Extractor
// ==========================================
export type { ExtractAnimationOptions } from './animation.js';
export { extractAnimation } from './animation.js';

// ==========================================
// 11. Animation Playback Descriptions
// ==========================================
export type { AnimationPlaybackDescriptor } from './animation-playback.js';
export { describeAnimationPlayback } from './animation-playback.js';

// ==========================================
// 12. Individual Frame Slicer
// ==========================================
export { extractAnimationFrames } from './frames.js';
export type { ExtractFramesOptions, FrameSlice } from './frames.js';

// ==========================================
// 13. Custom Animations Layout Config
// ==========================================
export type {
  AnimationRowsLayout,
  CustomAnimationDefinition,
} from './custom-animations.js';
export {
  animationRowsLayout,
  customAnimationBase,
  customAnimations,
  customAnimationSize,
} from './custom-animations.js';

// ==========================================
// 14. System Constants and Configurations
// ==========================================
export type {
  AnimationConfig,
  AnimationFolderName,
  AnimationListEntry,
  Direction,
  LicenseGroup,
  LicenseGroupConfig,
  StandardBodyType,
} from './constants.js';
export {
  ANIMATIONS,
  ANIMATION_CONFIGS,
  ANIMATION_DEFAULTS,
  ANIMATION_OFFSETS,
  BODY_TYPES,
  COMPACT_FRAME_SIZE,
  DIRECTIONS,
  FRAME_SIZE,
  LICENSE_CONFIG,
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  LICENSE_VERSION_RANK,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
  VIRTUAL_ANIMATION_MAP,
} from './constants.js';

// ==========================================
// 15. Image & Pixel Recolor Core
// ==========================================
export type {
  ColorHex,
  Palette,
  PaletteSwap,
  RecolorOptions,
} from './recolor.js';
export { recolorImage, recolorPixels } from './recolor.js';

// ==========================================
// 16. Static Asset Validator
// ==========================================
export { validateAssets } from './validation/asset-validator.js';
export type { ValidateAssetsOptions, ValidationIssue } from './validation/asset-validator.js';

// ==========================================
// 16. Animation Capability Rules
// ==========================================
export type { ItemAnimationCapabilities } from './animation-capabilities.js';
export {
  animationsSupportFolder,
  auditAnimationFolder,
  compatibleAnimationSource,
  compatibleAnimationSources,
  itemAnimationCapabilities,
} from './animation-capabilities.js';

// ==========================================
// 17. Animation Asset Audit Planner
// ==========================================
export type {
  AnimationAuditConsumer,
  AnimationAuditFrameCell,
  AnimationAuditFrameRow,
  AnimationAuditGeometry,
  AnimationAuditPlanningError,
  AssetAnimationAuditPlan,
  AuditLayerName,
  PlanAssetAnimationAuditOptions,
  PlannedAnimationAsset,
  UnsupportedAnimationFinding,
  UnsupportedAnimationRequirement,
} from './asset-animation-audit.js';
export {
  animationAuditGeometry,
  customAnimationGeometry,
  planAssetAnimationAudit,
  standardAnimationGeometry,
} from './asset-animation-audit.js';

// ==========================================
// 18. Provider-Neutral Sprite Drawing Contract
// ==========================================
export type {
  PlanSpriteDrawingContractOptions,
  SpriteDrawingBaselineCell,
  SpriteDrawingBaselineReference,
  SpriteDrawingCell,
  SpriteDrawingCellPolicy,
  SpriteDrawingCellPolicyInput,
  SpriteDrawingContract,
  SpriteDrawingGeometry,
  SpriteDrawingLayerContext,
  SpriteDrawingReference,
  SpriteDrawingRow,
  SpriteDrawingSourceReference,
  SpriteDrawingTarget,
  SpriteDrawingTargetInput,
  SpriteDrawingTransparencyRules,
  SpriteDrawingWorkKind,
} from './sprite-drawing-contract.js';
export {
  planSpriteDrawingContract,
  spriteDrawingContractDigestInput,
  spriteDrawingContractProjection,
  spriteDrawingTargetId,
  SPRITE_DRAWING_CONTRACT_SCHEMA,
} from './sprite-drawing-contract.js';
