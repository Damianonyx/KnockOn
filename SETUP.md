# Knock-On configuration

For a fresh checkout, copy `.env.example` to `.env` and enter your Univer license contents and AntLing API key. If `.env` already exists, edit it directly. The model is configured as `Ling-3.2-flash`. Only the template belongs in version control; `.gitignore` excludes environment files and licenses.

| Variable | Value |
| --- | --- |
| `UNIVER_LICENSE` | Full contents of your `license.txt` file. |
| `UNIVER_LICENSE_KEY` | Full contents of your `licenseKey.txt` file. |
| `ANTLING_API_KEY` | Your API key from AntLing's console. |
| `ANTLING_BASE_URL` | `https://api.ant-ling.com/v1` for direct AntLing API access. |
| `ANTLING_MODEL` | `Ling-3.2-flash`; already configured. |

AntLing's [official API model listing](https://developer.ant-ling.com/en/docs/faq/), checked on November 6, 2026, confirms `Ling-3.2-flash`. Both `.env` and `.env.example` use that exact, case-sensitive ID. Access with your account still needs a live API check after you add the key.

These files prepare configuration only. The app and SDK integration have not been implemented yet. License activation and API access must be verified during integration. The application must load `.env` and pass the relevant values to the SDKs. Restart the app after editing its environment. Hosted deployments need the same values entered in their environment settings.

## Univer

The Web SDK takes the contents of `license.txt` in its license plugin or advanced preset. Collaboration and Exchange server features use both files. When wiring the editor, pass only `UNIVER_LICENSE` to its browser configuration as required by Univer. Keep `UNIVER_LICENSE_KEY` and `ANTLING_API_KEY` on the server; never copy them into browser configuration or variables prefixed with `NEXT_PUBLIC_` or `VITE_`.

Setting an environment value does not establish that a license is valid or covers a specific domain or feature. Verify those when the SDK is integrated.

[Univer license configuration](https://docs.univer.ai/server/license)

## Use Ling to help write the app

AntLing's API key can power a coding tool. For example, in the Kilo Code extension for VS Code, select **OpenAI Compatible** and enter:

- Base URL: `https://api.ant-ling.com/v1`
- API key: your AntLing key, through the extension's settings.
- Model ID: `Ling-3.2-flash`.

Open the project folder and give Ling a scoped development task, such as implementing scenario persistence or integrating the Univer editor. Configure the coding tool separately; merely adding `.env` does not select Ling in the editor.

AntLing also documents using Ling through Claude Code with its Anthropic-compatible endpoint. In that configuration, Claude Code is the coding tool and Ling generates the responses. You can keep a separate Claude model configuration for UI work if the client's requirements allow it.

Adding an AntLing key to this project does not change the model powering an existing Codex or Claude session. To use Ling for backend development, explicitly select it in the coding tool or call its API.

[Kilo Code setup](https://developer.ant-ling.com/en/docs/integrations/kilo-code/) · [Claude Code setup](https://developer.ant-ling.com/en/docs/integrations/claude-code/)

## Use Ling inside Knock-On

Using Ling to write backend code is separate from selecting an AI provider for explanations inside the app. The intended explanation flow is: user edits the model, Univer recalculates, the backend sends the relevant assumptions and calculated results to the chosen model, and the UI displays the explanation. The backend must validate proposed edits before applying them. Demand changes and other uncertain relationships remain explicit user assumptions.

For a small connection check after filling in `.env`, run the following from this folder with Node.js 22 or later. It sends a short prompt to AntLing and may consume API credits. It does not send the Univer license files.

```bash
node --env-file=.env --input-type=module <<'JS'
const { ANTLING_API_KEY, ANTLING_BASE_URL, ANTLING_MODEL } = process.env;
if (!ANTLING_API_KEY?.trim() || !ANTLING_MODEL?.trim()) {
  throw new Error('Fill in ANTLING_API_KEY and ANTLING_MODEL in .env first.');
}
const response = await fetch(`${ANTLING_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
  method: 'POST',
  redirect: 'error',
  signal: AbortSignal.timeout(60000),
  headers: {
    Authorization: `Bearer ${ANTLING_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: ANTLING_MODEL,
    messages: [{ role: 'user', content: 'Reply with: Knock-On API connection successful.' }],
    max_tokens: 512,
  }),
});
if (!response.ok) throw new Error(`AntLing returned HTTP ${response.status}. Check key, model access, and quota.`);
const result = await response.json();
const message = result.choices?.[0]?.message?.content;
if (!message) throw new Error('The API returned no text. Inspect the model response settings.');
console.log(message);
JS
```

If Ling is selected for explanations in the finished app, calls will run in a server route using `process.env.ANTLING_API_KEY`. Users' browsers will call that route instead of calling AntLing directly.

[AntLing API quickstart](https://developer.ant-ling.com/en/docs/getting-started/quickstart/)
