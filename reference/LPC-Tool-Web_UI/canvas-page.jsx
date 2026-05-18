// The top-level page — composes everything into a DesignCanvas.

const { DesignCanvas, DCSection, DCArtboard } = window;

function CanvasPage() {
  return (
    <DesignCanvas>
      <DCSection id="desktop" title="Desktop · main editor" subtitle="Three-region layout. Dark is the default for pixel work. Light theme below.">
        <DCArtboard id="desktop-dark" label="Dark theme · hero" width={1480} height={920}>
          <Editor theme="dark" label="Knight" hash="#a7e2c9" ariaLabel="LPC Toolkit · main editor · dark theme" />
        </DCArtboard>
        <DCArtboard id="desktop-light" label="Light theme" width={1480} height={920}>
          <Editor theme="light" label="Knight" hash="#a7e2c9" ariaLabel="LPC Toolkit · main editor · light theme" />
        </DCArtboard>
      </DCSection>

      <DCSection id="mobile" title="Mobile · tabs collapse the three regions" subtitle="Preview stays priority. Bottom tabs swap between Preview · Layers · Credits · Export.">
        <DCArtboard id="m-preview" label="Preview tab" width={360} height={760}>
          <MobileEditor theme="dark" tab="preview" label="Knight" />
        </DCArtboard>
        <DCArtboard id="m-layers" label="Layers tab" width={360} height={760}>
          <MobileEditor theme="dark" tab="layers" label="Knight" />
        </DCArtboard>
        <DCArtboard id="m-credits" label="Credits tab" width={360} height={760}>
          <MobileEditor theme="dark" tab="credits" label="Knight" />
        </DCArtboard>
        <DCArtboard id="m-export" label="Export tab" width={360} height={760}>
          <MobileEditor theme="dark" tab="export" label="Knight" />
        </DCArtboard>
        <DCArtboard id="m-light" label="Preview · light" width={360} height={760}>
          <MobileEditor theme="light" tab="preview" label="Knight" />
        </DCArtboard>
      </DCSection>

      <DCSection id="states" title="Required states" subtitle="Loading the catalog; empty character; search with no matches; layer load error.">
        <DCArtboard id="s-loading" label="Catalog loading" width={1280} height={760}>
          <LoadingState theme="dark" />
        </DCArtboard>
        <DCArtboard id="s-empty" label="Empty character (body only)" width={1280} height={760}>
          <EmptyCharacterState theme="dark" />
        </DCArtboard>
        <DCArtboard id="s-search" label="Search no match" width={1280} height={760}>
          <SearchEmptyState theme="dark" />
        </DCArtboard>
        <DCArtboard id="s-error" label="Layer failed to load" width={1280} height={760}>
          <LayerErrorState theme="dark" />
        </DCArtboard>
      </DCSection>

      <DCSection id="tokens" title="Design tokens" subtitle="Palette, license colors, type, spacing. Same scale in both themes.">
        <DCArtboard id="t-dark" label="Dark tokens" width={920} height={1280}>
          <TokensCard theme="dark" />
        </DCArtboard>
        <DCArtboard id="t-light" label="Light tokens" width={920} height={1280}>
          <TokensCard theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="inventory" title="Component inventory" subtitle="Every React function-component implied by the design, with key props/states and the shadcn/ui primitive it composes onto.">
        <DCArtboard id="inv" label="Components · 6 groups · 32 components" width={1280} height={1340}>
          <InventoryCard theme="dark" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<CanvasPage />);
