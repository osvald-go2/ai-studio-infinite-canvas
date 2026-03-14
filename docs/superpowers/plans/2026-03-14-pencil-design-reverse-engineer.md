# AI Studio Infinite Canvas — Pencil Design Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new .pen design file that 1:1 replicates the AI Studio Infinite Canvas React app UI using pencil MCP tools.

**Architecture:** Design System + Screens hybrid approach — first set up variables (design tokens), then build 16 reusable components, then assemble 10 full pages. All work done via pencil MCP tools (`open_document`, `set_variables`, `batch_design`, `get_screenshot`, `snapshot_layout`).

**Tech Stack:** Pencil MCP tools, .pen file format, lucide icon font

**Spec:** `docs/superpowers/specs/2026-03-14-reverse-engineer-pencil-design-spec.md`

---

## Chunk 1: Foundation (File, Variables, Basic Components)

### Task 1: Create File and Set Design Tokens

**Tools:** `open_document`, `set_variables`

- [ ] **Step 1: Create new .pen file**

```
open_document("new")
```

After creation, note the file path. We will rename/move it later if needed.

- [ ] **Step 2: Set all design token variables**

Use `set_variables` to define all tokens from spec Section 1. Group into a single call:

```json
{
  "variables": {
    "bg-primary": { "type": "color", "value": "#171717" },
    "bg-black": { "type": "color", "value": "#000000" },
    "bg-surface": { "type": "color", "value": "#2A2421" },
    "bg-card": { "type": "color", "value": "#3A3D4A" },
    "bg-sidebar": { "type": "color", "value": "#1A1512" },
    "bg-content": { "type": "color", "value": "#14100E" },
    "bg-input": { "type": "color", "value": "#9A6A45" },
    "border-default": { "type": "color", "value": "#FFFFFF1A" },
    "border-subtle": { "type": "color", "value": "#FFFFFF0D" },
    "border-focus": { "type": "color", "value": "#FFFFFF33" },
    "text-primary": { "type": "color", "value": "#FFFFFF" },
    "text-secondary": { "type": "color", "value": "#E5E7EB" },
    "text-tertiary": { "type": "color", "value": "#D1D5DB" },
    "text-muted": { "type": "color", "value": "#9CA3AF" },
    "text-disabled": { "type": "color", "value": "#6B7280" },
    "status-inbox": { "type": "color", "value": "#D1D5DB" },
    "status-inprocess": { "type": "color", "value": "#93C5FD" },
    "status-review": { "type": "color", "value": "#FCD34D" },
    "status-done": { "type": "color", "value": "#6EE7B7" },
    "status-inbox-bg": { "type": "color", "value": "#6B728033" },
    "status-inprocess-bg": { "type": "color", "value": "#3B82F633" },
    "status-review-bg": { "type": "color", "value": "#F59E0B33" },
    "status-done-bg": { "type": "color", "value": "#10B98133" },
    "tab-status-inbox": { "type": "color", "value": "#60A5FA" },
    "tab-status-inprocess": { "type": "color", "value": "#FBBF24" },
    "tab-status-review": { "type": "color", "value": "#A78BFA" },
    "tab-status-done": { "type": "color", "value": "#34D399" },
    "tab-status-inbox-bg": { "type": "color", "value": "#3B82F633" },
    "tab-status-inprocess-bg": { "type": "color", "value": "#F59E0B33" },
    "tab-status-review-bg": { "type": "color", "value": "#8B5CF633" },
    "tab-status-done-bg": { "type": "color", "value": "#10B98133" },
    "interactive-bg": { "type": "color", "value": "#FFFFFF1A" },
    "interactive-bg-subtle": { "type": "color", "value": "#FFFFFF0D" },
    "interactive-hover": { "type": "color", "value": "#FFFFFF33" },
    "interactive-hover-subtle": { "type": "color", "value": "#FFFFFF26" },
    "accent-blue": { "type": "color", "value": "#3B82F6" },
    "accent-blue-light": { "type": "color", "value": "#60A5FA" },
    "accent-orange": { "type": "color", "value": "#FB923C" },
    "accent-rose": { "type": "color", "value": "#FB7185" },
    "accent-red": { "type": "color", "value": "#EF4444" },
    "accent-blue-600": { "type": "color", "value": "#2563EB" },
    "git-modified": { "type": "color", "value": "#EAB308" },
    "git-modified-bg": { "type": "color", "value": "#EAB30819" },
    "git-added": { "type": "color", "value": "#22C55E" },
    "git-added-bg": { "type": "color", "value": "#22C55E19" },
    "git-deleted": { "type": "color", "value": "#EF4444" },
    "git-deleted-bg": { "type": "color", "value": "#EF444419" },
    "radius-card": { "type": "number", "value": 32 },
    "radius-modal": { "type": "number", "value": 32 },
    "radius-button": { "type": "number", "value": 12 },
    "radius-input": { "type": "number", "value": 24 },
    "radius-badge": { "type": "number", "value": 100 }
  }
}
```

- [ ] **Step 3: Verify variables are set**

```
get_variables()
```

Confirm all 51 variables are present with correct values.

---

### Task 2: Create Design System Frame and Basic Components

**Tools:** `batch_design`, `get_screenshot`

All components go inside a top-level "Design System" frame. Each component marked `reusable: true`.

- [ ] **Step 1: Create Design System container frame**

```javascript
ds=I(document,{type:"frame",name:"Design System",layout:"horizontal",gap:40,padding:40,fill:"$bg-primary",width:2000,height:"fit_content(800)",placeholder:true,x:0,y:0})
```

- [ ] **Step 2: Build IconButton component (spec 2.1)**

```javascript
iconBtn=I(ds,{type:"frame",name:"IconButton",reusable:true,layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:100,fill:"#00000000"})
iconBtnIcon=I(iconBtn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"x",width:16,height:16,fill:"$text-muted"})
```

- [ ] **Step 3: Build GhostButton component (spec 2.2)**

```javascript
ghostBtn=I(ds,{type:"frame",name:"GhostButton",reusable:true,layout:"horizontal",justifyContent:"center",alignItems:"center",gap:8,padding:[8,16],cornerRadius:"$radius-button",fill:"$interactive-bg"})
ghostBtnText=I(ghostBtn,{type:"text",content:"Button",fontSize:14,fill:"$text-primary"})
```

- [ ] **Step 4: Build StatusBadge — Board Variant (spec 2.3)**

```javascript
boardBadge=I(ds,{type:"frame",name:"StatusBadge-Board",reusable:true,layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:"$radius-badge",fill:"$status-inbox-bg"})
boardBadgeText=I(boardBadge,{type:"text",content:"INBOX",fontSize:11,fontWeight:"600",fill:"$status-inbox",letterSpacing:0.5})
```

- [ ] **Step 5: Build StatusBadge — Tab Variant (spec 2.4)**

```javascript
tabBadge=I(ds,{type:"frame",name:"StatusBadge-Tab",reusable:true,layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:"$radius-badge",fill:"$tab-status-inbox-bg"})
tabBadgeText=I(tabBadge,{type:"text",content:"INBOX",fontSize:10,fontWeight:"600",fill:"$tab-status-inbox",letterSpacing:0.5})
```

- [ ] **Step 6: Build ModelBadge (spec 2.5)**

```javascript
modelBadge=I(ds,{type:"frame",name:"ModelBadge",reusable:true,layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:"$radius-badge",fill:"$interactive-bg"})
modelBadgeText=I(modelBadge,{type:"text",content:"Claude",fontSize:11,fill:"$text-muted"})
```

- [ ] **Step 7: Build TextInput (spec 2.6)**

```javascript
textInput=I(ds,{type:"frame",name:"TextInput",reusable:true,layout:"horizontal",alignItems:"center",padding:[10,14],cornerRadius:12,fill:"#00000033",stroke:{fill:"$border-subtle",thickness:1}})
textInputText=I(textInput,{type:"text",content:"Placeholder...",fontSize:14,fill:"$text-disabled"})
```

- [ ] **Step 8: Build SearchInput (spec 2.7)**

```javascript
searchInput=I(ds,{type:"frame",name:"SearchInput",reusable:true,layout:"horizontal",alignItems:"center",gap:8,padding:[6,12],cornerRadius:8,fill:"$interactive-bg-subtle",stroke:{fill:"$border-default",thickness:1}})
searchIcon=I(searchInput,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"search",width:16,height:16,fill:"$text-muted"})
searchText=I(searchInput,{type:"text",content:"Search...",fontSize:14,fill:"$text-muted"})
```

- [ ] **Step 9: Verify basic components with screenshot**

```
get_screenshot(ds_id)
```

Confirm all 7 basic components render correctly inside the Design System frame.

---

### Task 3: Create Chat Components

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Build UserMessage (spec 2.8)**

```javascript
userMsg=I(ds,{type:"frame",name:"UserMessage",reusable:true,layout:"horizontal",padding:[14,20],cornerRadius:24,fill:"$interactive-bg"})
userMsgText=I(userMsg,{type:"text",content:"How do I implement infinite canvas with pan and zoom?",fontSize:14,fill:"$text-secondary",textGrowth:"fixed-width",width:400})
```

- [ ] **Step 2: Build AssistantMessage (spec 2.9)**

```javascript
assistMsg=I(ds,{type:"frame",name:"AssistantMessage",reusable:true,layout:"horizontal",padding:[0,4],fill:"#00000000"})
assistMsgText=I(assistMsg,{type:"text",content:"I'll help you implement an infinite canvas. Here's the approach using CSS transforms...",fontSize:14,fill:"$text-tertiary",textGrowth:"fixed-width",width:500})
```

- [ ] **Step 3: Build ChatInput (spec 2.10)**

Build in multiple operations (complex component):

```javascript
chatInput=I(ds,{type:"frame",name:"ChatInput",reusable:true,layout:"vertical",cornerRadius:"$radius-input",fill:"#9A6A454D",width:560})
chatTextarea=I(chatInput,{type:"frame",name:"TextareaArea",layout:"horizontal",padding:[12,16],fill:"#00000000",width:"fill_container"})
chatPlaceholder=I(chatTextarea,{type:"text",content:"What do you want to do?",fontSize:14,fill:"$text-disabled"})
chatToolbar=I(chatInput,{type:"frame",name:"Toolbar",layout:"horizontal",alignItems:"center",gap:8,padding:[4,8],width:"fill_container"})
```

Then add toolbar children:

```javascript
toolbarPlus=I(chatToolbar,{type:"ref",ref:iconBtn_id})
U(toolbarPlus+"/"+iconBtnIcon_id,{iconFontName:"plus"})
toolbarModel=I(chatToolbar,{type:"ref",ref:modelBadge_id})
toolbarSpacer=I(chatToolbar,{type:"frame",name:"Spacer",width:"fill_container",height:1})
toolbarSend=I(chatToolbar,{type:"frame",name:"SendBtn",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:100,fill:"$interactive-bg"})
toolbarSendIcon=I(toolbarSend,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"arrow-up",width:16,height:16,fill:"$text-primary"})
```

- [ ] **Step 4: Verify chat components**

```
get_screenshot(ds_id)
```

---

### Task 4: Create Composite Components — SessionWindow & TopBar

**Tools:** `batch_design`, `get_screenshot`, `snapshot_layout`

- [ ] **Step 1: Build SessionWindow card mode (spec 2.11)**

Create the SessionWindow container:

```javascript
sessWin=I(ds,{type:"frame",name:"SessionWindow",reusable:true,layout:"vertical",width:600,cornerRadius:"$radius-card",fill:"#3A3D4AF2",stroke:{fill:"$border-default",thickness:1},effect:[{type:"background_blur",radius:24},{type:"shadow",shadowType:"outer",offset:{x:0,y:8},blur:24,color:"#00000066"}]})
```

Add header:

```javascript
sessHeader=I(sessWin,{type:"frame",name:"Header",layout:"horizontal",justifyContent:"space_between",alignItems:"center",padding:[16,24],width:"fill_container"})
sessClose=I(sessHeader,{type:"frame",name:"CloseBtn",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:100,fill:"$interactive-bg-subtle"})
sessCloseIcon=I(sessClose,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"x",width:16,height:16,fill:"$text-muted"})
sessHeaderRight=I(sessHeader,{type:"frame",name:"HeaderActions",layout:"horizontal",gap:8,alignItems:"center"})
sessClockIcon=I(sessHeaderRight,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"clock",width:18,height:18,fill:"$text-muted"})
sessPlusIcon=I(sessHeaderRight,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"plus",width:18,height:18,fill:"$text-muted"})
```

Add messages area with sample messages:

```javascript
sessMessages=I(sessWin,{type:"frame",name:"Messages",layout:"vertical",gap:24,padding:[8,24,24,24],width:"fill_container",height:"fill_container(400)",clip:true})
sessUserMsg=I(sessMessages,{type:"frame",name:"UserMsgWrap",layout:"horizontal",justifyContent:"end",width:"fill_container"})
sessUserMsgInner=I(sessUserMsg,{type:"ref",ref:userMsg_id})
sessAssistMsg=I(sessMessages,{type:"ref",ref:assistMsg_id})
```

Add ChatInput instance:

```javascript
sessChatInput=I(sessWin,{type:"ref",ref:chatInput_id})
```

- [ ] **Step 2: Verify SessionWindow with screenshot**

```
get_screenshot(sessWin_id)
```

- [ ] **Step 3: Build TopBar (spec 2.12)**

```javascript
topBar=I(ds,{type:"frame",name:"TopBar",reusable:true,layout:"horizontal",justifyContent:"space_between",alignItems:"center",height:56,width:1440,padding:[0,24],fill:"#00000033",stroke:{fill:"$border-default",thickness:{bottom:1}},effect:{type:"background_blur",radius:12}})
```

Add left group:

```javascript
topLeft=I(topBar,{type:"frame",name:"LeftGroup",layout:"horizontal",gap:16,alignItems:"center"})
topLogo=I(topLeft,{type:"text",name:"Logo",content:"AI Studio",fontSize:18,fontWeight:"700",fill:{type:"gradient",gradientType:"linear",rotation:90,colors:[{color:"$accent-orange",position:0},{color:"$accent-rose",position:1}]}})
topProjectBtn=I(topLeft,{type:"frame",name:"ProjectSwitcher",layout:"horizontal",gap:8,alignItems:"center",padding:[6,12],cornerRadius:8})
topProjectBadge=I(topProjectBtn,{type:"frame",name:"Badge",layout:"horizontal",justifyContent:"center",alignItems:"center",width:24,height:24,cornerRadius:6,fill:"#3B82F6"})
topProjectBadgeText=I(topProjectBadge,{type:"text",content:"AI",fontSize:10,fontWeight:"700",fill:"$text-primary"})
topProjectName=I(topProjectBtn,{type:"text",content:"AI Studio",fontSize:14,fontWeight:"500",fill:"$text-secondary"})
topProjectChevron=I(topProjectBtn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"chevron-down",width:14,height:14,fill:"$text-muted"})
```

Add view mode toggle:

```javascript
topViewToggle=I(topLeft,{type:"frame",name:"ViewToggle",layout:"horizontal",gap:2,padding:4,cornerRadius:8,fill:"$interactive-bg-subtle"})
topViewCanvas=I(topViewToggle,{type:"frame",name:"CanvasBtn",layout:"horizontal",gap:6,alignItems:"center",padding:[6,12],cornerRadius:6,fill:"$interactive-hover-subtle"})
topViewCanvasIcon=I(topViewCanvas,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"layout-dashboard",width:14,height:14,fill:"$text-primary"})
topViewCanvasText=I(topViewCanvas,{type:"text",content:"Canvas",fontSize:14,fill:"$text-primary"})
topViewBoard=I(topViewToggle,{type:"frame",name:"BoardBtn",layout:"horizontal",gap:6,alignItems:"center",padding:[6,12],cornerRadius:6})
topViewBoardIcon=I(topViewBoard,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"columns",width:14,height:14,fill:"$text-muted"})
topViewBoardText=I(topViewBoard,{type:"text",content:"Board",fontSize:14,fill:"$text-muted"})
topViewTab=I(topViewToggle,{type:"frame",name:"TabBtn",layout:"horizontal",gap:6,alignItems:"center",padding:[6,12],cornerRadius:6})
topViewTabIcon=I(topViewTab,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"maximize",width:14,height:14,fill:"$text-muted"})
topViewTabText=I(topViewTab,{type:"text",content:"Tab",fontSize:14,fill:"$text-muted"})
```

Add right group:

```javascript
topRight=I(topBar,{type:"frame",name:"RightGroup",layout:"horizontal",gap:16,alignItems:"center"})
topSearch=I(topRight,{type:"ref",ref:searchInput_id,width:200})
topNewSession=I(topRight,{type:"frame",name:"NewSessionBtn",layout:"horizontal",gap:8,alignItems:"center",padding:[8,16],cornerRadius:"$radius-button",fill:"$interactive-bg"})
topNewSessionIcon=I(topNewSession,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"plus",width:16,height:16,fill:"$text-primary"})
topNewSessionText=I(topNewSession,{type:"text",content:"New Session",fontSize:14,fill:"$text-primary"})
```

- [ ] **Step 4: Verify TopBar**

```
get_screenshot(topBar_id)
```

---

### Task 5: Create Remaining Composite Components

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Build BoardCard (spec 2.13)**

```javascript
boardCard=I(ds,{type:"frame",name:"BoardCard",reusable:true,layout:"vertical",gap:12,padding:16,cornerRadius:16,width:288,fill:"#FFFFFF0D",stroke:{fill:"$border-subtle",thickness:{top:2,right:1,bottom:1,left:1}}})
boardCardTitle=I(boardCard,{type:"text",name:"Title",content:"Implement infinite canvas",fontSize:14,fontWeight:"600",fill:"$text-primary"})
boardCardPreview=I(boardCard,{type:"text",name:"Preview",content:"Working on the pan and zoom functionality using CSS transforms and wheel events...",fontSize:13,fill:"$text-muted",textGrowth:"fixed-width",width:"fill_container"})
boardCardFooter=I(boardCard,{type:"frame",name:"Footer",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
boardCardModel=I(boardCardFooter,{type:"ref",ref:modelBadge_id})
boardCardMsgCount=I(boardCardFooter,{type:"frame",name:"MsgCount",layout:"horizontal",gap:4,alignItems:"center"})
boardCardMsgIcon=I(boardCardMsgCount,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"message-square",width:12,height:12,fill:"$text-disabled"})
boardCardMsgText=I(boardCardMsgCount,{type:"text",content:"5",fontSize:12,fill:"$text-disabled"})
```

- [ ] **Step 2: Build ZoomControls (spec 2.14)**

```javascript
zoomCtrl=I(ds,{type:"frame",name:"ZoomControls",reusable:true,layout:"horizontal",gap:4,alignItems:"center",padding:8,cornerRadius:12,fill:"#00000066",effect:{type:"background_blur",radius:12}})
zoomIn=I(zoomCtrl,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:28,height:28,cornerRadius:100})
zoomInIcon=I(zoomIn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"zoom-in",width:14,height:14,fill:"$text-muted"})
zoomText=I(zoomCtrl,{type:"text",content:"100%",fontSize:12,fill:"$text-muted"})
zoomOut=I(zoomCtrl,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:28,height:28,cornerRadius:100})
zoomOutIcon=I(zoomOut,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"zoom-out",width:14,height:14,fill:"$text-muted"})
zoomDivider=I(zoomCtrl,{type:"rectangle",width:1,height:16,fill:"$border-default"})
zoomReset=I(zoomCtrl,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:28,height:28,cornerRadius:100})
zoomResetIcon=I(zoomReset,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"maximize",width:14,height:14,fill:"$text-muted"})
```

- [ ] **Step 3: Build BroadcastPanel (spec 2.16)**

```javascript
broadcast=I(ds,{type:"frame",name:"BroadcastPanel",reusable:true,layout:"vertical",gap:12,padding:16,width:600,cornerRadius:16,fill:"#2A2421F2",stroke:{fill:"$border-focus",thickness:1},effect:{type:"background_blur",radius:24}})
broadcastHeader=I(broadcast,{type:"frame",name:"Header",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
broadcastInfo=I(broadcastHeader,{type:"text",content:"Broadcasting to 2 sessions",fontSize:14,fill:"$accent-blue-light"})
broadcastCancel=I(broadcastHeader,{type:"text",content:"Cancel",fontSize:12,fill:"$text-muted"})
broadcastTextWrap=I(broadcast,{type:"frame",name:"TextWrap",layout:"none",width:"fill_container",height:80,cornerRadius:12,fill:"#00000033",stroke:{fill:"$border-default",thickness:1}})
broadcastTextarea=I(broadcastTextWrap,{type:"text",content:"Enter a message to broadcast...",fontSize:14,fill:"$text-disabled",x:14,y:10})
broadcastSendBtn=I(broadcastTextWrap,{type:"frame",name:"SendBtn",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:8,fill:"$accent-blue-600",x:540,y:40})
broadcastSendIcon=I(broadcastSendBtn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"send",width:14,height:14,fill:"$text-primary"})
```

- [ ] **Step 4: Build ModalBackdrop (spec 2.15)**

```javascript
modalBD=I(ds,{type:"frame",name:"ModalBackdrop",reusable:true,layout:"none",width:1440,height:900,fill:"#00000099",effect:{type:"background_blur",radius:8}})
```

Note: GitSidebar uses a lighter variant (`#00000066`, blur radius 4) — override these per instance.

- [ ] **Step 5: Remove placeholder flag from Design System frame**

```javascript
U(ds_id,{placeholder:false})
```

- [ ] **Step 6: Final verification of all components**

```
get_screenshot(ds_id)
```

Confirm all 16 components (7 basic + 3 chat + 6 composite) are visible and correctly styled.

---

## Chunk 2: Main View Pages (Canvas View, Board View, Tab View)

### Task 6: Canvas View — Main (spec 3.1)

**Tools:** `batch_design`, `get_screenshot`, `find_empty_space_on_canvas`

- [ ] **Step 1: Create page frame with placeholder**

```javascript
canvasPage=I(document,{type:"frame",name:"Canvas View — Main",layout:"vertical",width:1440,height:900,clip:true,fill:"$bg-primary",placeholder:true,x:0,y:1000})
```

- [ ] **Step 2: Add background image at 40% opacity and TopBar**

First add a background image rectangle at 40% opacity, then TopBar:

```javascript
canvasBgImg=I(canvasPage,{type:"rectangle",name:"BgImage",width:1440,height:900,opacity:0.4})
G(canvasBgImg,"ai","abstract dark gradient with subtle purple and orange nebula texture, dark background")
canvasTopBar=I(canvasPage,{type:"ref",ref:topBar_id,width:"fill_container"})
```

Note: The bg image is at z-0, TopBar overlays it via vertical layout order.

- [ ] **Step 3: Create canvas area with SessionWindow instances**

```javascript
canvasArea=I(canvasPage,{type:"frame",name:"Canvas Area",layout:"none",width:"fill_container",height:"fill_container",clip:true,fill:"#00000000"})
```

Add 3 SessionWindow instances at different positions:

```javascript
cSess1=I(canvasArea,{type:"ref",ref:sessWin_id,x:80,y:40})
cSess2=I(canvasArea,{type:"ref",ref:sessWin_id,x:420,y:180})
cSess3=I(canvasArea,{type:"ref",ref:sessWin_id,x:760,y:60})
```

Apply focused state to one (cSess2):

```javascript
U(cSess2,{stroke:{fill:"#3B82F680",thickness:4},effect:[{type:"background_blur",radius:24},{type:"shadow",shadowType:"outer",offset:{x:0,y:8},blur:32,color:"#3B82F633"}]})
```

- [ ] **Step 4: Add tool buttons (top-left)**

```javascript
toolBtns=I(canvasArea,{type:"frame",name:"ToolButtons",layout:"vertical",gap:4,padding:4,cornerRadius:12,fill:"#00000066",x:16,y:16})
toolHand=I(toolBtns,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:8})
toolHandIcon=I(toolHand,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"hand",width:16,height:16,fill:"$text-muted"})
toolSelect=I(toolBtns,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:8,fill:"#3B82F680"})
toolSelectIcon=I(toolSelect,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"mouse-pointer-2",width:16,height:16,fill:"$text-primary"})
```

- [ ] **Step 5: Add ZoomControls (bottom-right)**

```javascript
canvasZoom=I(canvasArea,{type:"ref",ref:zoomCtrl_id,x:1280,y:740})
```

- [ ] **Step 6: Remove placeholder and verify**

```javascript
U(canvasPage_id,{placeholder:false})
```

```
get_screenshot(canvasPage_id)
```

---

### Task 7: Canvas View — Multi-Select (spec 3.2)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Copy Canvas View Main and set as placeholder**

```javascript
multiSelectPage=C(canvasPage_id,document,{name:"Canvas View — Multi-Select",x:1550,y:1000,placeholder:true})
```

- [ ] **Step 2: Discover new child IDs after copy**

IMPORTANT: Copy creates new IDs for all children. Must use `batch_get` to find them:

```
batch_get(filePath, nodeIds: [multiSelectPage_id], readDepth: 2)
```

From the result, identify the canvas area frame ID and the 3 SessionWindow instance IDs within it. Record these as `ms_canvasArea_id`, `ms_sess1_id`, `ms_sess2_id`, `ms_sess3_id`.

- [ ] **Step 3: Modify session windows for selected state**

Using the discovered IDs from Step 2:

```javascript
U(ms_sess1_id,{stroke:{fill:"$accent-blue",thickness:2}})
U(ms_sess3_id,{stroke:{fill:"$accent-blue",thickness:2}})
```

- [ ] **Step 4: Add selection rectangle overlay and BroadcastPanel**

Using the discovered canvas area ID from Step 2:

```javascript
selRect=I(ms_canvasArea_id,{type:"rectangle",name:"Selection Box",x:60,y:30,width:700,height:500,fill:"#3B82F633",stroke:{fill:"$accent-blue-light",thickness:1},cornerRadius:2})
msBroadcast=I(ms_canvasArea_id,{type:"ref",ref:broadcast_id,x:420,y:680})
```

- [ ] **Step 5: Remove placeholder and verify**

```javascript
U(multiSelectPage_id,{placeholder:false})
```

```
get_screenshot(multiSelectPage_id)
```

---

### Task 8: Board View (spec 3.3)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Create page frame**

```javascript
boardPage=I(document,{type:"frame",name:"Board View",layout:"vertical",width:1600,height:960,clip:true,fill:"$bg-primary",placeholder:true,x:0,y:2050})
```

- [ ] **Step 2: Add TopBar instance with Board mode active**

```javascript
boardTopBar=I(boardPage,{type:"ref",ref:topBar_id,width:"fill_container"})
```

Override view toggle to show Board active (swap Canvas/Board fills and text colors):

```javascript
U(boardTopBar+"/"+topViewCanvas_id,{fill:"#00000000"})
U(boardTopBar+"/"+topViewCanvasIcon_id,{fill:"$text-muted"})
U(boardTopBar+"/"+topViewCanvasText_id,{fill:"$text-muted"})
U(boardTopBar+"/"+topViewBoard_id,{fill:"$interactive-hover-subtle"})
U(boardTopBar+"/"+topViewBoardIcon_id,{fill:"$text-primary"})
U(boardTopBar+"/"+topViewBoardText_id,{fill:"$text-primary"})
```

- [ ] **Step 3: Create board content area and all 4 columns**

**batch_design call 1** — content area + Inbox column (~15 ops):

```javascript
boardContent=I(boardPage,{type:"frame",name:"BoardContent",layout:"horizontal",gap:24,padding:32,width:"fill_container",height:"fill_container"})
colInbox=I(boardContent,{type:"frame",name:"Inbox",layout:"vertical",gap:12,width:320})
colInboxHeader=I(colInbox,{type:"frame",name:"Header",layout:"horizontal",gap:8,alignItems:"center"})
colInboxDot=I(colInboxHeader,{type:"ellipse",width:8,height:8,fill:"$status-inbox"})
colInboxTitle=I(colInboxHeader,{type:"text",content:"Inbox",fontSize:14,fontWeight:"600",fill:"$text-primary"})
colInboxCount=I(colInboxHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:100,fill:"$interactive-bg"})
colInboxCountText=I(colInboxCount,{type:"text",content:"2",fontSize:11,fill:"$text-muted"})
card1=I(colInbox,{type:"ref",ref:boardCard_id})
U(card1+"/"+boardCardTitle_id,{content:"Setup project scaffolding"})
U(card1,{stroke:{fill:{colors:[{color:"$status-inbox",position:0}],type:"color"},thickness:{top:2,right:1,bottom:1,left:1}}})
card2=I(colInbox,{type:"ref",ref:boardCard_id})
U(card2+"/"+boardCardTitle_id,{content:"Design authentication flow"})
```

**batch_design call 2** — In Process column (~15 ops):

```javascript
colInProcess=I(boardContent,{type:"frame",name:"In Process",layout:"vertical",gap:12,width:320})
colIPHeader=I(colInProcess,{type:"frame",name:"Header",layout:"horizontal",gap:8,alignItems:"center"})
colIPDot=I(colIPHeader,{type:"ellipse",width:8,height:8,fill:"$status-inprocess"})
colIPTitle=I(colIPHeader,{type:"text",content:"In Process",fontSize:14,fontWeight:"600",fill:"$text-primary"})
colIPCount=I(colIPHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:100,fill:"$interactive-bg"})
colIPCountText=I(colIPCount,{type:"text",content:"3",fontSize:11,fill:"$text-muted"})
cardIP1=I(colInProcess,{type:"ref",ref:boardCard_id})
U(cardIP1+"/"+boardCardTitle_id,{content:"Implement infinite canvas"})
U(cardIP1,{stroke:{fill:"$status-inprocess",thickness:{top:2,right:1,bottom:1,left:1}}})
cardIP2=I(colInProcess,{type:"ref",ref:boardCard_id})
U(cardIP2+"/"+boardCardTitle_id,{content:"Add multi-select support"})
cardIP3=I(colInProcess,{type:"ref",ref:boardCard_id})
U(cardIP3+"/"+boardCardTitle_id,{content:"Build broadcast messaging"})
```

**batch_design call 3** — Review + Done columns (~20 ops):

```javascript
colReview=I(boardContent,{type:"frame",name:"Review",layout:"vertical",gap:12,width:320})
colRHeader=I(colReview,{type:"frame",name:"Header",layout:"horizontal",gap:8,alignItems:"center"})
colRDot=I(colRHeader,{type:"ellipse",width:8,height:8,fill:"$status-review"})
colRTitle=I(colRHeader,{type:"text",content:"Review",fontSize:14,fontWeight:"600",fill:"$text-primary"})
colRCount=I(colRHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:100,fill:"$interactive-bg"})
colRCountText=I(colRCount,{type:"text",content:"2",fontSize:11,fill:"$text-muted"})
cardR1=I(colReview,{type:"ref",ref:boardCard_id})
U(cardR1+"/"+boardCardTitle_id,{content:"Review tab view layout"})
U(cardR1,{stroke:{fill:"$status-review",thickness:{top:2,right:1,bottom:1,left:1}}})
cardR2=I(colReview,{type:"ref",ref:boardCard_id})
U(cardR2+"/"+boardCardTitle_id,{content:"Review git sidebar panel"})

colDone=I(boardContent,{type:"frame",name:"Done",layout:"vertical",gap:12,width:320})
colDHeader=I(colDone,{type:"frame",name:"Header",layout:"horizontal",gap:8,alignItems:"center"})
colDDot=I(colDHeader,{type:"ellipse",width:8,height:8,fill:"$status-done"})
colDTitle=I(colDHeader,{type:"text",content:"Done",fontSize:14,fontWeight:"600",fill:"$text-primary"})
colDCount=I(colDHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:100,fill:"$interactive-bg"})
colDCountText=I(colDCount,{type:"text",content:"1",fontSize:11,fill:"$text-muted"})
cardD1=I(colDone,{type:"ref",ref:boardCard_id})
U(cardD1+"/"+boardCardTitle_id,{content:"Project initialization"})
U(cardD1,{stroke:{fill:"$status-done",thickness:{top:2,right:1,bottom:1,left:1}}})
```

- [ ] **Step 4: Add right sidebar overlay with SessionWindow**

The page uses vertical layout, so the sidebar must be overlaid via an absolutely positioned wrapper. Change the page content area to `layout: none` for the overlay:

```javascript
boardOverlay=I(boardPage,{type:"frame",name:"SidebarOverlay",layout:"none",width:1600,height:904,fill:"#00000000",x:0,y:56})
boardSidebar=I(boardOverlay,{type:"frame",name:"Sidebar",layout:"vertical",width:500,height:904,fill:"#00000000",x:1100,y:0,effect:{type:"shadow",shadowType:"outer",offset:{x:-8,y:0},blur:24,color:"#00000066"}})
boardSidebarSess=I(boardSidebar,{type:"ref",ref:sessWin_id,width:"fill_container",height:"fill_container",cornerRadius:0})
```

Note: `boardOverlay` is absolutely positioned over the boardContent by placing it after boardContent in the vertical layout, then using `M()` if needed.

- [ ] **Step 5: Add ZoomControls (bottom-left)**

Position ZoomControls absolutely within the overlay frame:

```javascript
boardZoom=I(boardOverlay,{type:"ref",ref:zoomCtrl_id,x:24,y:840})
```

- [ ] **Step 7: Remove placeholder and verify**

```javascript
U(boardPage_id,{placeholder:false})
```

```
get_screenshot(boardPage_id)
```

---

### Task 9: Tab View + Empty State (specs 3.4, 3.5)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Create Tab View page frame**

```javascript
tabPage=I(document,{type:"frame",name:"Tab View",layout:"vertical",width:1440,height:900,clip:true,fill:"$bg-primary",placeholder:true,x:0,y:3150})
```

- [ ] **Step 2: Add TopBar with Tab mode active**

```javascript
tabTopBar=I(tabPage,{type:"ref",ref:topBar_id,width:"fill_container"})
U(tabTopBar+"/"+topViewCanvas_id,{fill:"#00000000"})
U(tabTopBar+"/"+topViewCanvasIcon_id,{fill:"$text-muted"})
U(tabTopBar+"/"+topViewCanvasText_id,{fill:"$text-muted"})
U(tabTopBar+"/"+topViewTab_id,{fill:"$interactive-hover-subtle"})
U(tabTopBar+"/"+topViewTabIcon_id,{fill:"$text-primary"})
U(tabTopBar+"/"+topViewTabText_id,{fill:"$text-primary"})
```

- [ ] **Step 3: Create body with sidebar and content area**

```javascript
tabBody=I(tabPage,{type:"frame",name:"Body",layout:"horizontal",width:"fill_container",height:"fill_container"})
tabSidebar=I(tabBody,{type:"frame",name:"Sidebar",layout:"vertical",width:320,height:"fill_container",fill:"#1A1512CC"})
tabContent=I(tabBody,{type:"frame",name:"Content",layout:"vertical",width:"fill_container",height:"fill_container",fill:"$bg-content"})
```

- [ ] **Step 4: Build sidebar content**

Add SearchInput at top:

```javascript
tabSidebarSearch=I(tabSidebar,{type:"frame",name:"SearchWrap",padding:12,width:"fill_container"})
tabSearchRef=I(tabSidebarSearch,{type:"ref",ref:searchInput_id,width:"fill_container"})
```

Add session list items (4-5 items):

```javascript
tabSessList=I(tabSidebar,{type:"frame",name:"SessionList",layout:"vertical",gap:2,width:"fill_container",padding:[0,4]})
```

For each session item, create a frame with title + StatusBadge-Tab + git info:

```javascript
tabItem1=I(tabSessList,{type:"frame",name:"SessionItem",layout:"vertical",gap:4,padding:[10,16],width:"fill_container",cornerRadius:8,fill:"#3B82F633",stroke:{fill:"#3B82F64D",thickness:1}})
tabItem1Row1=I(tabItem1,{type:"frame",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
tabItem1Title=I(tabItem1Row1,{type:"text",content:"Infinite Canvas Implementation",fontSize:14,fill:"$text-primary"})
tabItem1Badge=I(tabItem1Row1,{type:"ref",ref:tabBadge_id})
U(tabItem1Badge+"/"+tabBadgeText_id,{content:"IN PROCESS",fill:"$tab-status-inprocess"})
U(tabItem1Badge,{fill:"$tab-status-inprocess-bg"})
tabItem1Row2=I(tabItem1,{type:"frame",layout:"horizontal",gap:12,alignItems:"center",width:"fill_container"})
tabItem1Git1=I(tabItem1Row2,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"git-branch",width:12,height:12,fill:"$text-disabled"})
tabItem1Branch=I(tabItem1Row2,{type:"text",content:"feat/canvas",fontSize:12,fill:"$text-disabled"})
tabItem1Git2=I(tabItem1Row2,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"folder-git-2",width:12,height:12,fill:"$text-disabled"})
tabItem1Worktree=I(tabItem1Row2,{type:"text",content:"/src/canvas",fontSize:12,fill:"$text-disabled"})
```

**batch_design call 2** — Add 3 inactive items (~25 ops):

```javascript
tabItem2=I(tabSessList,{type:"frame",name:"SessionItem",layout:"vertical",gap:4,padding:[10,16],width:"fill_container",cornerRadius:8})
tabItem2Row1=I(tabItem2,{type:"frame",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
tabItem2Title=I(tabItem2Row1,{type:"text",content:"Auth Flow Design",fontSize:14,fill:"$text-primary"})
tabItem2Badge=I(tabItem2Row1,{type:"ref",ref:tabBadge_id})
U(tabItem2Badge+"/"+tabBadgeText_id,{content:"INBOX",fill:"$tab-status-inbox"})
U(tabItem2Badge,{fill:"$tab-status-inbox-bg"})
tabItem2Row2=I(tabItem2,{type:"frame",layout:"horizontal",gap:12,alignItems:"center",width:"fill_container"})
tabItem2Git=I(tabItem2Row2,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"git-branch",width:12,height:12,fill:"$text-disabled"})
tabItem2Branch=I(tabItem2Row2,{type:"text",content:"feat/auth",fontSize:12,fill:"$text-disabled"})

tabItem3=I(tabSessList,{type:"frame",name:"SessionItem",layout:"vertical",gap:4,padding:[10,16],width:"fill_container",cornerRadius:8})
tabItem3Row1=I(tabItem3,{type:"frame",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
tabItem3Title=I(tabItem3Row1,{type:"text",content:"API Integration",fontSize:14,fill:"$text-primary"})
tabItem3Badge=I(tabItem3Row1,{type:"ref",ref:tabBadge_id})
U(tabItem3Badge+"/"+tabBadgeText_id,{content:"REVIEW",fill:"$tab-status-review"})
U(tabItem3Badge,{fill:"$tab-status-review-bg"})

tabItem4=I(tabSessList,{type:"frame",name:"SessionItem",layout:"vertical",gap:4,padding:[10,16],width:"fill_container",cornerRadius:8})
tabItem4Row1=I(tabItem4,{type:"frame",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
tabItem4Title=I(tabItem4Row1,{type:"text",content:"Test Coverage",fontSize:14,fill:"$text-primary"})
tabItem4Badge=I(tabItem4Row1,{type:"ref",ref:tabBadge_id})
U(tabItem4Badge+"/"+tabBadgeText_id,{content:"DONE",fill:"$tab-status-done"})
U(tabItem4Badge,{fill:"$tab-status-done-bg"})
```

- [ ] **Step 5: Add SessionWindow in content area (fullscreen mode)**

```javascript
tabSessionWin=I(tabContent,{type:"ref",ref:sessWin_id,width:"fill_container",height:"fill_container",cornerRadius:0})
```

- [ ] **Step 6: Remove placeholder and verify**

```javascript
U(tabPage_id,{placeholder:false})
```

```
get_screenshot(tabPage_id)
```

- [ ] **Step 7: Create Tab View Empty State**

Copy tabPage:

```javascript
tabEmptyPage=C(tabPage_id,document,{name:"Tab View — Empty State",x:1550,y:3150,placeholder:true})
```

- [ ] **Step 7b: Discover child IDs after copy**

IMPORTANT: Copy creates new IDs. Use `batch_get` to find the content area and SessionWindow:

```
batch_get(filePath, nodeIds: [tabEmptyPage_id], readDepth: 3)
```

From the result, identify the content area frame ID (`te_content_id`) and the SessionWindow ref ID inside it (`te_sessWin_id`).

- [ ] **Step 7c: Replace SessionWindow with empty state**

Delete the SessionWindow and insert empty state content:

```javascript
D(te_sessWin_id)
emptyWrap=I(te_content_id,{type:"frame",name:"EmptyState",layout:"vertical",gap:16,justifyContent:"center",alignItems:"center",width:"fill_container",height:"fill_container"})
emptyIcon=I(emptyWrap,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"message-square",width:48,height:48,fill:"$text-disabled"})
emptyText=I(emptyWrap,{type:"text",content:"Select a session to get started",fontSize:14,fill:"$text-muted"})
```

- [ ] **Step 8: Remove placeholder and verify empty state**

```javascript
U(tabEmptyPage_id,{placeholder:false})
```

```
get_screenshot(tabEmptyPage_id)
```

---

## Chunk 3: Modal/Overlay Pages and Dropdowns

### Task 10: NewSessionModal (spec 3.6)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Create page frame with backdrop**

```javascript
modalPage=I(document,{type:"frame",name:"NewSessionModal",layout:"none",width:1440,height:900,clip:true,fill:"$bg-primary",placeholder:true,x:0,y:4200})
modalBackdropRef=I(modalPage,{type:"ref",ref:modalBD_id,width:1440,height:900,x:0,y:0})
```

- [ ] **Step 2: Create modal dialog**

Center the modal at approximately (464, 100):

```javascript
modal=I(modalPage,{type:"frame",name:"Modal",layout:"vertical",gap:20,padding:24,width:512,cornerRadius:"$radius-modal",fill:"#2A2421F2",stroke:{fill:"$border-default",thickness:1},effect:[{type:"background_blur",radius:24},{type:"shadow",shadowType:"outer",offset:{x:0,y:8},blur:32,color:"#00000066"}],x:464,y:100})
```

- [ ] **Step 3: Add modal header**

```javascript
modalHeader=I(modal,{type:"frame",name:"Header",layout:"horizontal",justifyContent:"space_between",alignItems:"center",width:"fill_container"})
modalTitle=I(modalHeader,{type:"text",content:"New Session",fontSize:18,fontWeight:"600",fill:"$text-primary"})
modalClose=I(modalHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:40,height:40,cornerRadius:100,fill:"$interactive-bg-subtle"})
modalCloseIcon=I(modalClose,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"x",width:18,height:18,fill:"$text-muted"})
```

- [ ] **Step 4: Add Title input (comes first)**

```javascript
modalTitleInput=I(modal,{type:"ref",ref:textInput_id,width:"fill_container"})
U(modalTitleInput+"/"+textInputText_id,{content:"Session title..."})
```

- [ ] **Step 5: Add Model label and model cards**

```javascript
modalModelLabel=I(modal,{type:"text",content:"Model",fontSize:14,fontWeight:"500",fill:"$text-tertiary"})
modalModels=I(modal,{type:"frame",name:"ModelCards",layout:"horizontal",gap:12,width:"fill_container"})
```

Create 3 model cards (Claude selected, Codex/Gemini unselected):

```javascript
modelClaude=I(modalModels,{type:"frame",name:"Claude",layout:"vertical",justifyContent:"center",alignItems:"center",gap:8,padding:16,cornerRadius:12,width:"fill_container",fill:"$interactive-bg",stroke:{fill:"$border-focus",thickness:1}})
claudeIcon=I(modelClaude,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"bot",width:24,height:24,fill:"$text-primary"})
claudeText=I(modelClaude,{type:"text",content:"Claude Code",fontSize:13,fontWeight:"500",fill:"$text-primary"})

modelCodex=I(modalModels,{type:"frame",name:"Codex",layout:"vertical",justifyContent:"center",alignItems:"center",gap:8,padding:16,cornerRadius:12,width:"fill_container",fill:"#00000033",stroke:{fill:"$border-subtle",thickness:1}})
codexIcon=I(modelCodex,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"terminal",width:24,height:24,fill:"$text-muted"})
codexText=I(modelCodex,{type:"text",content:"Codex",fontSize:13,fontWeight:"500",fill:"$text-muted"})

modelGemini=I(modalModels,{type:"frame",name:"Gemini",layout:"vertical",justifyContent:"center",alignItems:"center",gap:8,padding:16,cornerRadius:12,width:"fill_container",fill:"#00000033",stroke:{fill:"$border-subtle",thickness:1}})
geminiIcon=I(modelGemini,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"sparkles",width:24,height:24,fill:"$text-muted"})
geminiText=I(modelGemini,{type:"text",content:"Gemini",fontSize:13,fontWeight:"500",fill:"$text-muted"})
```

- [ ] **Step 6: Add Git fields (2-column)**

```javascript
modalGitRow=I(modal,{type:"frame",name:"GitFields",layout:"horizontal",gap:12,width:"fill_container"})
modalBranchInput=I(modalGitRow,{type:"ref",ref:textInput_id,width:"fill_container"})
U(modalBranchInput+"/"+textInputText_id,{content:"Git branch..."})
modalWorktreeInput=I(modalGitRow,{type:"ref",ref:textInput_id,width:"fill_container"})
U(modalWorktreeInput+"/"+textInputText_id,{content:"Worktree path..."})
```

- [ ] **Step 7: Add prompt textarea and footer**

```javascript
modalPrompt=I(modal,{type:"frame",name:"PromptInput",layout:"horizontal",padding:[10,14],cornerRadius:12,fill:"#00000033",stroke:{fill:"$border-subtle",thickness:1},width:"fill_container",height:80})
modalPromptText=I(modalPrompt,{type:"text",content:"Initial prompt (optional)...",fontSize:14,fill:"$text-disabled"})

modalFooter=I(modal,{type:"frame",name:"Footer",layout:"horizontal",justifyContent:"end",gap:12,width:"fill_container"})
modalCancelBtn=I(modalFooter,{type:"ref",ref:ghostBtn_id})
U(modalCancelBtn+"/"+ghostBtnText_id,{content:"Cancel"})
modalCreateBtn=I(modalFooter,{type:"frame",name:"CreateBtn",layout:"horizontal",justifyContent:"center",alignItems:"center",gap:8,padding:[8,16],cornerRadius:"$radius-button",fill:"$interactive-bg",stroke:{fill:"$border-subtle",thickness:1}})
modalCreateText=I(modalCreateBtn,{type:"text",content:"Create Session",fontSize:14,fill:"$text-primary"})
```

- [ ] **Step 8: Remove placeholder and verify**

```javascript
U(modalPage_id,{placeholder:false})
```

```
get_screenshot(modalPage_id)
```

---

### Task 11: GitSidebar (spec 3.7)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Create page frame with backdrop**

```javascript
gitPage=I(document,{type:"frame",name:"GitSidebar",layout:"none",width:1440,height:900,clip:true,fill:"$bg-primary",placeholder:true,x:1550,y:4200})
gitBackdropRef=I(gitPage,{type:"ref",ref:modalBD_id,width:1440,height:900,x:0,y:0,fill:"#00000066",effect:{type:"background_blur",radius:4}})
```

Note: GitSidebar uses lighter backdrop (black/40 + blur 4) via instance overrides.

- [ ] **Step 2: Create sidebar panel**

```javascript
gitPanel=I(gitPage,{type:"frame",name:"Panel",layout:"vertical",width:450,height:900,fill:"#1A1512F2",stroke:{fill:"$border-default",thickness:{left:1}},effect:{type:"background_blur",radius:24},x:990,y:0})
```

- [ ] **Step 3: Add header**

```javascript
gitHeader=I(gitPanel,{type:"frame",name:"Header",layout:"horizontal",justifyContent:"space_between",alignItems:"center",padding:[16,24],width:"fill_container"})
gitTitle=I(gitHeader,{type:"text",content:"SOURCE CONTROL",fontSize:12,fontWeight:"600",fill:"$text-muted",letterSpacing:2})
gitClose=I(gitHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:100,fill:"$interactive-bg-subtle"})
gitCloseIcon=I(gitClose,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"x",width:16,height:16,fill:"$text-muted"})
```

- [ ] **Step 4: Add commit section**

```javascript
gitCommit=I(gitPanel,{type:"frame",name:"CommitSection",layout:"vertical",gap:12,padding:[0,24],width:"fill_container"})
gitTextarea=I(gitCommit,{type:"frame",name:"CommitInput",layout:"horizontal",padding:[10,14],cornerRadius:12,fill:"#00000066",stroke:{fill:"$border-default",thickness:1},width:"fill_container",height:112})
gitTextareaText=I(gitTextarea,{type:"text",content:"Message (Ctrl+Enter to commit)",fontSize:14,fill:"$text-disabled"})
gitBtnRow=I(gitCommit,{type:"frame",name:"BtnRow",layout:"horizontal",gap:8,width:"fill_container"})
gitCommitBtn=I(gitBtnRow,{type:"frame",name:"CommitBtn",layout:"horizontal",justifyContent:"center",alignItems:"center",gap:8,padding:[8,16],cornerRadius:"$radius-button",fill:"#2563EBCC",width:"fill_container"})
gitCommitIcon=I(gitCommitBtn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"check",width:16,height:16,fill:"$text-primary"})
gitCommitText=I(gitCommitBtn,{type:"text",content:"Commit",fontSize:14,fill:"$text-primary"})
gitDiscardBtn=I(gitBtnRow,{type:"frame",name:"DiscardBtn",layout:"horizontal",justifyContent:"center",alignItems:"center",gap:8,padding:[8,16],cornerRadius:"$radius-button",fill:"$git-deleted-bg"})
gitDiscardIcon=I(gitDiscardBtn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"trash-2",width:16,height:16,fill:"$accent-red"})
gitDiscardText=I(gitDiscardBtn,{type:"text",content:"Discard",fontSize:14,fill:"$accent-red"})
```

- [ ] **Step 5: Add Changes header and file list**

```javascript
gitChangesHeader=I(gitPanel,{type:"frame",name:"ChangesHeader",layout:"horizontal",justifyContent:"space_between",alignItems:"center",padding:[12,24],width:"fill_container"})
gitChangesLabel=I(gitChangesHeader,{type:"text",content:"CHANGES",fontSize:12,fontWeight:"600",fill:"$text-muted",letterSpacing:1})
gitChangesCount=I(gitChangesHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:100,fill:"$interactive-bg"})
gitChangesCountText=I(gitChangesCount,{type:"text",content:"4",fontSize:11,fill:"$text-tertiary"})
```

Add 4 file rows (mix of M/A/D):

```javascript
gitFileList=I(gitPanel,{type:"frame",name:"FileList",layout:"vertical",width:"fill_container"})
```

For each file (repeat pattern with different names/statuses):

```javascript
gitFile1=I(gitFileList,{type:"frame",layout:"horizontal",justifyContent:"space_between",alignItems:"center",padding:[8,24],width:"fill_container"})
gitFile1Left=I(gitFile1,{type:"frame",layout:"horizontal",gap:8,alignItems:"center"})
gitFile1Icon=I(gitFile1Left,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"file-text",width:14,height:14,fill:"$text-muted"})
gitFile1Name=I(gitFile1Left,{type:"text",content:"src/components/CanvasView.tsx",fontSize:13,fill:"$text-secondary"})
gitFile1Badge=I(gitFile1,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[1,6],cornerRadius:4,fill:"$git-modified-bg",stroke:{fill:"#EAB30833",thickness:1}})
gitFile1BadgeText=I(gitFile1Badge,{type:"text",content:"M",fontSize:11,fontWeight:"600",fill:"$git-modified"})
```

- [ ] **Step 6: Remove placeholder and verify**

```javascript
U(gitPage_id,{placeholder:false})
```

```
get_screenshot(gitPage_id)
```

---

### Task 12: DiffModal (spec 3.8)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Create page frame with backdrop**

```javascript
diffPage=I(document,{type:"frame",name:"DiffModal",layout:"none",width:1440,height:900,clip:true,fill:"$bg-primary",placeholder:true,x:3100,y:4200})
diffBackdropRef=I(diffPage,{type:"ref",ref:modalBD_id,width:1440,height:900,x:0,y:0})
```

- [ ] **Step 2: Create modal dialog**

```javascript
diffModal=I(diffPage,{type:"frame",name:"Modal",layout:"vertical",width:1024,cornerRadius:"$radius-modal",fill:"#2A2421F2",stroke:{fill:"$border-default",thickness:1},effect:{type:"background_blur",radius:24},clip:true,x:208,y:90})
```

- [ ] **Step 3: Add header with filename and status badge**

```javascript
diffHeader=I(diffModal,{type:"frame",name:"Header",layout:"horizontal",justifyContent:"space_between",alignItems:"center",padding:[16,24],width:"fill_container"})
diffHeaderLeft=I(diffHeader,{type:"frame",layout:"horizontal",gap:12,alignItems:"center"})
diffFilename=I(diffHeaderLeft,{type:"text",content:"src/components/CanvasView.tsx",fontSize:16,fontWeight:"600",fill:"$text-primary"})
diffStatusBadge=I(diffHeaderLeft,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",padding:[2,8],cornerRadius:6,fill:"$git-modified-bg"})
diffStatusText=I(diffStatusBadge,{type:"text",content:"MODIFIED",fontSize:11,fontWeight:"700",fontFamily:"JetBrains Mono",fill:"$git-modified"})
diffCloseBtn=I(diffHeader,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:100,fill:"$interactive-bg-subtle"})
diffCloseIcon=I(diffCloseBtn,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"x",width:16,height:16,fill:"$text-muted"})
diffDivider=I(diffModal,{type:"rectangle",name:"Divider",width:"fill_container",height:1,fill:"$border-default"})
```

- [ ] **Step 4: Add diff content lines**

```javascript
diffContent=I(diffModal,{type:"frame",name:"DiffContent",layout:"vertical",width:"fill_container",height:600,clip:true})
```

Add sample diff lines (context, added, deleted):

```javascript
diffLine1=I(diffContent,{type:"frame",layout:"horizontal",padding:[4,24],width:"fill_container",fill:"#3B82F619"})
diffLine1Text=I(diffLine1,{type:"text",content:"@@ -45,8 +45,12 @@ export function CanvasView({",fontSize:12,fontFamily:"JetBrains Mono",fill:"#93C5FD"})

diffLine2=I(diffContent,{type:"frame",layout:"horizontal",padding:[4,24],width:"fill_container"})
diffLine2Text=I(diffLine2,{type:"text",content:"   const [scale, setScale] = useState(1);",fontSize:12,fontFamily:"JetBrains Mono",fill:"$text-muted"})

diffLine3=I(diffContent,{type:"frame",layout:"horizontal",padding:[4,24],width:"fill_container",fill:"#EF444419"})
diffLine3Text=I(diffLine3,{type:"text",content:"-  const handleWheel = (e) => {",fontSize:12,fontFamily:"JetBrains Mono",fill:"#FCA5A5"})

diffLine4=I(diffContent,{type:"frame",layout:"horizontal",padding:[4,24],width:"fill_container",fill:"#22C55E19"})
diffLine4Text=I(diffLine4,{type:"text",content:"+  const handleWheel = useCallback((e: WheelEvent) => {",fontSize:12,fontFamily:"JetBrains Mono",fill:"#86EFAC"})

diffLine5=I(diffContent,{type:"frame",layout:"horizontal",padding:[4,24],width:"fill_container",fill:"#22C55E19"})
diffLine5Text=I(diffLine5,{type:"text",content:"+    e.preventDefault();",fontSize:12,fontFamily:"JetBrains Mono",fill:"#86EFAC"})
```

Add 8-10 more lines to fill the area (mix of normal, added, deleted context).

- [ ] **Step 5: Remove placeholder and verify**

```javascript
U(diffPage_id,{placeholder:false})
```

```
get_screenshot(diffPage_id)
```

---

### Task 13: Standalone Dropdowns (specs 3.9, 3.10)

**Tools:** `batch_design`, `get_screenshot`

- [ ] **Step 1: Create Project Switcher Dropdown (spec 3.9)**

```javascript
projDD=I(document,{type:"frame",name:"Project Switcher Dropdown",layout:"vertical",width:280,cornerRadius:12,fill:"$bg-surface",stroke:{fill:"$border-default",thickness:1},effect:{type:"shadow",shadowType:"outer",offset:{x:0,y:4},blur:16,color:"#00000066"},placeholder:true,x:0,y:5200})
```

Add project items (3 projects):

```javascript
projList=I(projDD,{type:"frame",name:"ProjectList",layout:"vertical",padding:[8,0],width:"fill_container"})
```

Per project item:

```javascript
projItem1=I(projList,{type:"frame",layout:"horizontal",gap:10,alignItems:"center",padding:[8,12],width:"fill_container"})
projItem1Badge=I(projItem1,{type:"frame",layout:"horizontal",justifyContent:"center",alignItems:"center",width:32,height:32,cornerRadius:8,fill:"#3B82F6"})
projItem1BadgeText=I(projItem1Badge,{type:"text",content:"AI",fontSize:11,fontWeight:"700",fill:"$text-primary"})
projItem1Info=I(projItem1,{type:"frame",layout:"vertical",gap:2,width:"fill_container"})
projItem1Name=I(projItem1Info,{type:"text",content:"AI Studio Canvas",fontSize:13,fontWeight:"600",fill:"$text-primary"})
projItem1Path=I(projItem1Info,{type:"text",content:"~/repos/ai-studio-infinite-canvas",fontSize:11,fill:"$text-disabled"})
projItem1Check=I(projItem1,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"check",width:16,height:16,fill:"#34D399"})
```

Add divider and "Open Folder..." option:

```javascript
projDivider=I(projDD,{type:"rectangle",width:"fill_container",height:1,fill:"$border-default"})
projOpen=I(projDD,{type:"frame",layout:"horizontal",gap:8,alignItems:"center",padding:[8,12],width:"fill_container"})
projOpenIcon=I(projOpen,{type:"icon_font",iconFontFamily:"lucide",iconFontName:"folder-open",width:16,height:16,fill:"$text-muted"})
projOpenText=I(projOpen,{type:"text",content:"Open Folder...",fontSize:13,fill:"$text-muted"})
```

- [ ] **Step 2: Remove placeholder**

```javascript
U(projDD_id,{placeholder:false})
```

- [ ] **Step 3: Create Search Results Dropdown (spec 3.10)**

```javascript
searchDD=I(document,{type:"frame",name:"Search Results Dropdown",layout:"vertical",width:320,padding:4,cornerRadius:12,fill:"$bg-surface",stroke:{fill:"$border-default",thickness:1},effect:{type:"shadow",shadowType:"outer",offset:{x:0,y:4},blur:16,color:"#00000066"},placeholder:true,x:500,y:5200})
```

Add 3 result items:

```javascript
searchItem1=I(searchDD,{type:"frame",layout:"vertical",gap:4,padding:[8,12],cornerRadius:8,width:"fill_container"})
searchItem1Title=I(searchItem1,{type:"text",content:"Infinite Canvas Implementation",fontSize:13,fontWeight:"600",fill:"$text-primary"})
searchItem1Preview=I(searchItem1,{type:"text",content:"Working on pan and zoom with CSS transforms...",fontSize:12,fill:"$text-disabled"})
```

```javascript
searchItem2=I(searchDD,{type:"frame",layout:"vertical",gap:4,padding:[8,12],cornerRadius:8,width:"fill_container"})
searchItem2Title=I(searchItem2,{type:"text",content:"Auth Flow Design",fontSize:13,fontWeight:"600",fill:"$text-primary"})
searchItem2Preview=I(searchItem2,{type:"text",content:"Implementing OAuth2 with PKCE flow...",fontSize:12,fill:"$text-disabled"})

searchItem3=I(searchDD,{type:"frame",layout:"vertical",gap:4,padding:[8,12],cornerRadius:8,width:"fill_container"})
searchItem3Title=I(searchItem3,{type:"text",content:"API Integration",fontSize:13,fontWeight:"600",fill:"$text-primary"})
searchItem3Preview=I(searchItem3,{type:"text",content:"Setting up REST endpoints with validation...",fontSize:12,fill:"$text-disabled"})
```

- [ ] **Step 4: Remove placeholder and verify both dropdowns**

```javascript
U(searchDD_id,{placeholder:false})
```

```
get_screenshot(projDD_id)
get_screenshot(searchDD_id)
```

---

## Chunk 4: Final Verification and Cleanup

### Task 14: Full Design Verification

**Tools:** `get_screenshot`, `snapshot_layout`

- [ ] **Step 1: Screenshot every page for final QA**

Take screenshots of all 10 screens + Design System frame:

```
get_screenshot(ds_id)           // Design System
get_screenshot(canvasPage_id)   // Canvas View Main
get_screenshot(multiSelectPage_id) // Canvas Multi-Select
get_screenshot(boardPage_id)    // Board View
get_screenshot(tabPage_id)      // Tab View
get_screenshot(tabEmptyPage_id) // Tab Empty State
get_screenshot(modalPage_id)    // NewSessionModal
get_screenshot(gitPage_id)      // GitSidebar
get_screenshot(diffPage_id)     // DiffModal
get_screenshot(projDD_id)       // Project Switcher DD
get_screenshot(searchDD_id)     // Search Results DD
```

- [ ] **Step 2: Verify layout correctness with snapshot_layout**

Spot-check key pages:

```
snapshot_layout(canvasPage_id, maxDepth: 3)
snapshot_layout(boardPage_id, maxDepth: 3)
snapshot_layout(tabPage_id, maxDepth: 3)
```

- [ ] **Step 3: Fix any visual issues found**

Use `batch_design` with `U()` operations to correct any spacing, color, or sizing issues.

- [ ] **Step 4: Ensure no placeholder flags remain**

Check all top-level frames have `placeholder: false` or no placeholder property.

- [ ] **Step 5: Verify reusable components**

```
batch_get(filePath, patterns: [{reusable: true}])
```

Confirm all 16 components are listed as reusable.

---

## Execution Notes

### Key Dependencies
- Task 2-5 (components) must complete before Task 6-13 (pages), since pages reference components
- Task 6 (Canvas Main) must complete before Task 7 (Canvas Multi-Select), since Task 7 copies it
- Task 9 (Tab View) must complete before the empty state variant
- Tasks 10-13 (modals/dropdowns) are independent of each other

### Parallelization Opportunities
Tasks that can run in parallel (if using subagent-driven-development):
- **Group A** (after components done): Tasks 6+8+10+11+12+13 are independent
- **Group B** (sequential): Task 6 → Task 7, Task 9 (Tab → Tab Empty built within same task)

### batch_design Limits
- Maximum 25 operations per `batch_design` call
- Complex components (SessionWindow, TopBar) will need 2-3 calls each
- Always note returned IDs from each call for subsequent operations

### ID Management
- All node IDs are generated dynamically by pencil
- After each `batch_design` call, record the returned IDs for use in subsequent steps
- When using `C()` (copy), child IDs change — use `batch_get` to discover new child IDs before updating descendants
- For component instances (`ref`), use `instance_id + "/" + component_child_id` syntax to override descendants
