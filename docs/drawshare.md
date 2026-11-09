# DrawShare integration

The first version stays independent of DrawShare.
Its file boundary is the versioned review JSON, also embedded in exported HTML.

## Source study

Checked upstream on 2026-11-10 before relying on local code.
The existing DrawShare clone matched upstream.
JuliaBUGS and mcmcjs were inspected in separate temporary clones because their local copies were older.

| Project | Reviewed upstream commit | Relevant source |
| --- | --- | --- |
| DrawShare | `36015a4b940303c330c7bcaadd3bd254748c69e6` | [Objects](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/core/types.ts), [storage and renderer ports](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/core/ports.ts), [backup](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/composables/useProjectBackup.ts), [page renderer](https://github.com/shravanngoswamii/DrawShare/blob/36015a4b940303c330c7bcaadd3bd254748c69e6/src/composables/useStackRenderer.ts) |
| JuliaBUGS | `5fd788c2777dc57e0f39ae2b10eabfa902bb6f25` | [DoodlePPL hosting](https://github.com/TuringLang/JuliaBUGS.jl/blob/5fd788c2777dc57e0f39ae2b10eabfa902bb6f25/DoodlePPL/README.md) |
| mcmcjs | `46b149329b3c4013e7a673f1525617fe11f3a357` | [Graph types](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl/src/core/types.ts), [Cytoscape editor](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl-ui/src/widget/composables/useGraphInstance.ts), [file import](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl-ui/src/widget/composables/useImportExport.ts), [viewport controls](https://github.com/mcmcjs/mcmcjs/blob/46b149329b3c4013e7a673f1525617fe11f3a357/packages/doodleppl-ui/src/widget/composables/useViewportActions.ts) |

DrawShare stores strokes, text, images and coordinate-based shapes on pages.
Its renderer consumes those object types, and its backup format version 2 stores projects and per-page content arrays.
A code graph needs named relationships and evidence beyond those coordinates.

DoodlePPL separates explicit graph elements from its viewport and uses file import/export.
Those are useful patterns for this tool.
Its stochastic nodes, distributions and plates describe Bayesian models.
Review docs uses code types, methods and values directly.
No DoodlePPL source was copied.
JuliaBUGS's DoodlePPL directory hosts pages that load the editor package from mcmcjs.

## Smallest useful next step

Add a `ReviewBlock` to DrawShare with an ID, page ID, placement rectangle and the complete review JSON.
Use the existing review validator at the import boundary.
Render a selected diagram as an SVG/DOM overlay with its node inspector.
Keep the JSON editable and preserve stable document, diagram and node IDs when replacing generated content.

Keep handwritten strokes and text in their existing stores.
An optional annotation anchor can name `{ blockId, diagramId, nodeId }` with a page-coordinate fallback.
Regeneration replaces the block's generated document, not those human objects.
When a node disappears, keep its annotation and mark the anchor unresolved.

Extend the backup/export format to retain review blocks and anchors and test a round trip before adding live sync or replay support.
Import/export is enough for agents that can write files.
There is no need for another agent API in this first integration.
This is a proposal based on the source study, not an implemented DrawShare feature.
