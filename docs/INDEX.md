# Balanzify POS — Documentation Index

This `docs/` set fully specifies the Balanzify POS platform.

| File | Contents |
|---|---|
| **README.md** | System overview, technology stack (frontend + backend), high-level architecture & request lifecycle, module map, full file architecture, dependencies, running & go-live order. |
| **prompt.md** | Component-wise UI spec: color palette, typography, shape/depth/motion, CSS conventions, shared primitives (`kit.jsx`), chrome (`Shell.jsx`), every screen's components/modals/windows, key functions & hooks, tweakable props. |
| **COMPONENTS.md** | **Deep per-component reference** — for each component: purpose, props in, internal state, functions it owns, API calls, modals/windows it renders, and a data-flow tracing guide. Read this to understand what lives inside any component. |
| **EPICS.md** | 15 epics grouping the delivered feature set into value streams with scope, screens, API groups. |
| **STORIES.md** | User stories (role · capability · value) with acceptance criteria, mapped to epics. |
| **SCHEMA.md** | Logical data model: every entity, fields, relationships, and derived/computed views across all modules and add-ons. |
| **API_CONTRACT.md** *(see project root handoff)* | Endpoint-by-endpoint request/response contract (`/connector/api/...`). |

**Read order for a new engineer:** README → SCHEMA → API_CONTRACT → prompt → EPICS/STORIES.
