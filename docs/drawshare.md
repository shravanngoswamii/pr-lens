# DrawShare integration

Proposed file boundary: review JSON, also embedded in HTML.

## Source study

Upstream revisions checked on 2026-11-10:

| Project | Reviewed upstream commit | Relevant source |
| --- | --- | --- |
| DrawShare | `36015a4b940303c330c7bcaadd3bd254748c69e6` | [Objects](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/core/types.ts), [storage and renderer ports](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/core/ports.ts), [backup](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/composables/useProjectBackup.ts), [page renderer](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/composables/useStackRenderer.ts) |
| JuliaBUGS | `5fd788c2777dc57e0f39ae2b10eabfa902bb6f25` | [DoodlePPL hosting](https://github.com/TuringLang/JuliaBUGS.jl/blob/5fd788c2777dc57e0f39ae2b10eabfa902bb6f25/DoodlePPL/README.md) |
| mcmcjs | `46b149329b3c4013e7a673f1525617fe11f3a357` | [Graph types](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl/src/core/types.ts), [Cytoscape editor](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl-ui/src/widget/composables/useGraphInstance.ts), [file import](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl-ui/src/widget/composables/useImportExport.ts), [viewport controls](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl-ui/src/widget/composables/useViewportActions.ts) |


DrawShare stores page objects and exports them in version-2 backups.
Code graphs also need named relationships and evidence.
DoodlePPL's explicit nodes, edges and file exchange are useful patterns.
Its Bayesian concepts stay separate from code types and methods.
No source was copied.
JuliaBUGS hosts the editor built in mcmcjs.

## Proposal

Import a `ReviewBlock` with ID, page ID, placement and validated review JSON.
Render its diagrams as SVG/DOM overlays with node details.
Keep stable document, diagram and node IDs when regenerating.

Leave human strokes and text in their existing stores.
Optional anchors name `{blockId, diagramId, nodeId}` with a coordinate fallback.
Preserve unresolved annotations when nodes disappear.
Extend backup import/export and verify a round trip before adding sync.
