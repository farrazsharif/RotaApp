# Build & publish the Caremid Carer iOS app from Windows (Codemagic)

No Mac required. Codemagic builds on a cloud Mac, signs the app with your App
Store Connect API key, and uploads to TestFlight — all driven from a web
browser. The workflow is defined in `codemagic.yaml` at the repo root.

Everything below is done on your Windows laptop in a browser.

---

## Step 1 — Create the App Store Connect API key (one-time)

This key lets Codemagic sign and upload without any certificates by hand.

1. Go to **appstoreconnect.apple.com → Users and Access → Integrations** tab
   (older UI: "Keys" under *App Store Connect API*).
2. Under **App Store Connect API**, click **+** to generate a key.
   - Name: `Codemagic`
   - Access: **App Manager** (or Admin).
3. **Download the API key file (`.p8`)** — you can only download it once. Keep it.
4. Note the **Issuer ID** (top of the Keys page) and the **Key ID** (the row you created).

## Step 2 — Register the app in App Store Connect (one-time)

1. **appstoreconnect.apple.com → Apps → + → New App.**
2. Platform **iOS**, Name **Caremid Carer**, your language, SKU `caremid-carer`.
3. **Bundle ID:** `uk.co.caremid.carer`.
   - If it's not in the dropdown: go to
     **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → +**,
     register an **App ID** with that exact bundle ID, then come back. (Codemagic
     can also auto-register it on the first build, but doing it here is reliable.)

> ⚠️ The bundle ID `uk.co.caremid.carer` must match everywhere. Decide now if you
> want a different one — it's painful to change after the app record exists. Tell
> me and I'll update `capacitor.config.ts` + `codemagic.yaml`.

## Step 3 — Connect Codemagic

1. Sign up at **codemagic.io** → **Sign in with GitHub** → authorize.
2. **Add application** → choose this repo (`farrazsharif/RotaApp`) → it will
   detect `codemagic.yaml`.

## Step 4 — Add the API key to Codemagic

1. Codemagic → **Teams / Settings → Integrations → App Store Connect → Manage keys**
   (or **Add key**).
2. Fill in:
   - **Name:** `CaremidASC`  ← must match exactly (that's what `codemagic.yaml` references).
   - **Issuer ID**, **Key ID**, and upload the **`.p8`** file from Step 1.
3. Save.

## Step 5 — Run the build

1. Open the app in Codemagic → it shows the **"Caremid Carer — iOS"** workflow.
2. **Start new build** → pick branch `main` → **Start**.
3. It takes ~15–20 min: installs deps, builds the web app, generates the iOS
   project, signs, builds the IPA, and uploads to **TestFlight**.

## Step 6 — Test on your iPhone

1. App Store Connect → **TestFlight** → wait for the build to finish "Processing".
2. Add yourself as an **internal tester**; install **TestFlight** from the App
   Store on your iPhone and open the build. Check clock-in, call logs, receipts.

## Step 7 — Fill the listing & submit for review

1. App Store Connect → **App Store** tab: add **screenshots** (take them on your
   iPhone from the TestFlight build — a 6.7" iPhone screenshot set is required),
   **description**, **keywords**, **support URL**, **privacy policy URL**
   (required), and complete the **App Privacy** questionnaire (the app sends staff
   name, rota and care data to your own server).
2. **In the review notes, say it's an internal staff rota/care app and give a demo
   carer login** — this avoids the "it's just a website" rejection (Guideline 4.2).
3. **Add for Review → Submit.** First review is usually 24–48h.

### Updating later
Push a change to `main` → start a new Codemagic build. Codemagic bumps the build
number automatically. (For *backend* changes nothing is needed — the app talks to
the live API.)

### Publishing straight to the App Store (skip the manual submit)
Once you're happy on TestFlight and the listing is complete, set
`submit_to_app_store: true` under `publishing.app_store_connect` in
`codemagic.yaml` and future builds submit for review automatically.

### Costs
Codemagic's free tier includes ~500 Mac build-minutes/month (plenty for this).
Your Apple Developer membership you already have.
