# 🔍 Extension Debugging Guide

## The Problem

- ✅ Backend API works (returns Dataset #2)
- ✅ Wallet is connected in extension
- ❌ Extension shows "No datasets found"

## Root Cause

The webview UI needs to be reloaded after rebuild. The extension is using old JavaScript.

---

## 🚀 Quick Fix

### Step 1: Close the Extension Development Host

Close the VS Code window that says "[Extension Development Host]" in the title.

### Step 2: Recompile Extension

```bash
cd quantifyx
npm run compile
```

### Step 3: Rebuild Webview (Already Done)

The webview is already rebuilt with the fixes.

### Step 4: Restart Extension

1. Go back to your main VS Code window (where you have the `quantifyx` folder open)
2. Press **F5** to launch Extension Development Host
3. A new VS Code window will open
4. Click the QuantifyX icon in the sidebar

### Step 5: Test

1. **Disconnect** the wallet (click "Disconnect" button)
2. **Clear the input** field
3. **Paste your wallet address**: `0xD561E71ceb6A81E1383feB57BC476511fbF55d5B`
4. **Click "Connect"**
5. Open **DevTools** (Help → Toggle Developer Tools)
6. Look in the **Console** tab for:
   ```
   Fetching datasets for: 0xD561E71ceb6A81E1383feB57BC476511fbF55d5B
   Datasets loaded: {owned: Array(1), purchased: Array(0), rented: Array(0)}
   ```

---

## ✅ Expected Result

After clicking "Connect", you should see:

```
YOUR DATASETS (1)

OWNED 1
┌────────────────────────────────────────┐
│ Global Democracy Index           #2   │
│ This dataset contains the Democracy... │
│ Other  CSV                             │
│ [Unlock & Open]                        │
└────────────────────────────────────────┘
```

---

## 🐛 If Still Not Working

### Check 1: Backend Running?

```bash
curl "http://localhost:8000/api/datasets/user-datasets/0xD561E71ceb6A81E1383feB57BC476511fbF55d5B/"
```

Should return:
```json
{"owned": [{"token_id": 2, ...}], "total_count": 1}
```

### Check 2: Console Errors?

Open DevTools in the Extension Development Host and look for errors in:
- **Console** tab
- **Network** tab (check if the API call is made)

### Check 3: React State Issue?

The data might be loading but not rendering. Check console for:
```
Datasets loaded: {...}
```

If you see this but no datasets display, there's a React rendering issue.

---

## 🔧 What I Fixed

1. **Added `async/await`** to `handleConnectWallet`
2. **Added console.log** to track when datasets are fetched
3. **Added error alerts** to show API failures
4. **Made function await** the fetch before continuing

---

## 📝 Testing Checklist

- [ ] Close Extension Development Host
- [ ] Run `npm run compile` in `quantifyx` folder
- [ ] Press F5 to restart
- [ ] Click QuantifyX icon in sidebar
- [ ] Disconnect wallet
- [ ] Paste address: `0xD561E71ceb6A81E1383feB57BC476511fbF55d5B`
- [ ] Click Connect
- [ ] Open DevTools (Help → Toggle Developer Tools)
- [ ] Check Console for "Datasets loaded"
- [ ] Dataset should appear in sidebar

---

## 🎯 Alternative: Manual Refresh

If the dataset still doesn't appear after connecting:

1. Make sure you're connected
2. Click the **↻ Refresh** button next to "YOUR DATASETS (0)"
3. This will force a re-fetch

---

## 💡 Pro Tip

Keep DevTools open while testing so you can see:
- Network requests to the API
- Console logs
- Any JavaScript errors

To open DevTools in Extension Development Host:
- **Help** → **Toggle Developer Tools**
- Or press **Ctrl+Shift+I**

---

**If it still doesn't work after following these steps, share a screenshot of the DevTools Console and I'll help debug further!**
