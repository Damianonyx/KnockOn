/**
 * Documentation: one page, no search and no tabs. The model tables are built
 * from the bakery template itself, so they can never drift from the app.
 */
import Link from 'next/link';
import { AppHeader } from '@/components/ui/AppHeader';
import { KnockyPose } from '@/components/ui/KnockyPose';
import { formatMoney, formatNumber } from '@/lib/format';
import { BAKERY_DEMO_INPUTS, BAKERY_INPUTS, BAKERY_RESULTS, BAKERY_SIMPLIFICATIONS, type BakeryInputKey } from '@/lib/templates/bakery';
import { explainLimitsFromEnv } from '@/server/rateLimit';
import styles from './Docs.module.css';

export const metadata = {
  title: 'Documentation',
  description: 'How KnockOn works: the bakery model, shocks and responses, comparing, inspecting, explanations, saving and privacy.',
};

const SECTIONS = [
  { id: 'start', title: 'Quick start' },
  { id: 'model', title: 'The bakery model' },
  { id: 'scenarios', title: 'Baseline, shocks and responses' },
  { id: 'share', title: 'Charts, printing and Excel' },
  { id: 'example', title: 'A worked example' },
  { id: 'compare', title: 'Compare and inspect' },
  { id: 'explain', title: 'Explain' },
  { id: 'saving', title: 'Saving' },
  { id: 'privacy', title: 'Privacy and your data' },
  { id: 'limits', title: 'What KnockOn doesn’t do' },
  { id: 'questions', title: 'Common questions' },
];

const demoValue = (key: BakeryInputKey) =>
  key === 'monthlyUnits' ? formatNumber(BAKERY_DEMO_INPUTS[key]) : formatMoney(BAKERY_DEMO_INPUTS[key], 'GBP');

export default function DocsPage() {
  const limits = explainLimitsFromEnv();
  return (
    <>
      <AppHeader>
        <Link href="/projects" className="header-link">
          Your projects
        </Link>
      </AppHeader>
      <main className={`page ${styles.docs}`}>
        <header className={styles.top}>
          <KnockyPose pose="hello" width={96} />
          <div>
            <h1>Documentation</h1>
            <p>Everything KnockOn does, on one page.</p>
          </div>
        </header>

        <div className={styles.layout}>
          <nav className={styles.toc} aria-label="On this page">
            <strong>On this page</strong>
            <ol>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <article className={styles.body}>
            <section id="start" aria-labelledby="start-h">
              <h2 id="start-h">Quick start</h2>
              <p>
                KnockOn shows what one change does to a business. You model the business in a spreadsheet, introduce a
                change, try your responses, and compare the results.
              </p>
              <ol className={styles.steps}>
                <li>
                  <Link href="/projects">Open your projects</Link>, enter a name, pick a currency, choose{' '}
                  <b>Fictional demo bakery</b> and select <b>Create project</b>.
                </li>
                <li>
                  Change a blue input cell in the spreadsheet, or the same figure in the <b>Inputs</b> list. The results
                  update straight away.
                </li>
                <li>
                  Select <b>Save</b>.
                </li>
                <li>
                  Select <b>+ Add a shock</b>, say what changed, and enter the new figure.
                </li>
                <li>
                  Select <b>+ Response to …</b> and try a new price or a new supplier.
                </li>
                <li>
                  Scroll to <b>Compare</b> to see every scenario against your baseline.
                </li>
                <li>
                  Select any result to see its formula, or <b>✦&nbsp;Explain</b> to ask why the numbers look the way they do.
                </li>
              </ol>
            </section>

            <section id="model" aria-labelledby="model-h">
              <h2 id="model-h">The bakery model</h2>
              <p>
                The model is a real spreadsheet. It describes one month of a bakery that sells one product. You can
                change the eight inputs. Everything else is a formula, and the labels and formulas are locked.
              </p>

              <h3>Inputs you can change</h3>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Cell</th>
                      <th scope="col">Input</th>
                      <th scope="col" className={styles.num}>
                        Demo figure
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {BAKERY_INPUTS.map((m) => (
                      <tr key={m.key}>
                        <td>
                          <code>{m.cell}</code>
                        </td>
                        <td>{m.label}</td>
                        <td className={styles.num}>{demoValue(m.key as BakeryInputKey)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.note}>
                The demo figures are fictional and for learning. Choose <b>Blank</b> when you create a project to start
                every input at zero and enter your own.
              </p>

              <h3>Results the spreadsheet calculates</h3>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Cell</th>
                      <th scope="col">Result</th>
                      <th scope="col">Formula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BAKERY_RESULTS.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <code>{r.cell}</code>
                        </td>
                        <td>{r.label}</td>
                        <td>
                          <code>{r.formula}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Every figure you see comes from these formulas. The spreadsheet calculates them as you type, and again
                on the server each time you save. KnockOn never works out a number any other way.
              </p>

              <h3>What the model leaves out</h3>
              <ul>
                {BAKERY_SIMPLIFICATIONS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>

            <section id="scenarios" aria-labelledby="scenarios-h">
              <h2 id="scenarios-h">Baseline, shocks and responses</h2>
              <p>A project holds a small tree of scenarios. Each one is its own copy of the spreadsheet.</p>
              <dl className={styles.defs}>
                <div>
                  <dt>Baseline</dt>
                  <dd>
                    Your business as it is today. You can edit it until you add the first shock. After that it is locked,
                    so every comparison starts from the same figures.
                  </dd>
                </div>
                <div>
                  <dt>Shock</dt>
                  <dd>
                    Something that happens to the business. A shock is a copy of the baseline with one change:
                    <ul>
                      <li>
                        <b>Energy or fuel costs rise:</b> a new monthly energy cost.
                      </li>
                      <li>
                        <b>Supplier raises prices:</b> a new ingredient cost per unit.
                      </li>
                      <li>
                        <b>Sales fall:</b> a new number of units sold per month.
                      </li>
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Response</dt>
                  <dd>
                    Something you do about a shock. A response is a copy of that shock with your change:
                    <ul>
                      <li>
                        <b>Change the price:</b> a new price, plus the units you expect to sell at that price.
                      </li>
                      <li>
                        <b>Switch supplier:</b> a new ingredient cost per unit and a monthly delivery cost.
                      </li>
                    </ul>
                  </dd>
                </div>
              </dl>
              <p>
                Scenarios are named after what changed, for example “Energy £600/month” or “Price £5.50”. You can keep
                editing a shock or response after you create it.
              </p>
              <div className={styles.callout}>
                <strong>KnockOn never guesses how customers react.</strong>
                <p>
                  When you change a price, you enter the sales you expect at that price. If you later edit the price on
                  a shock or response, KnockOn asks you to confirm your expected sales before it saves. Your estimate is
                  recorded as an assumption and shown in Compare.
                </p>
              </div>
            </section>

            <section id="share" aria-labelledby="share-h">
              <h2 id="share-h">Charts, printing and Excel</h2>
              <p>
                Use <strong>Add overhead chart</strong> above the worksheet to plot monthly energy, rent, wages,
                other expenses and supplier delivery. Ingredient costs are separate. The chart appears below the
                model and updates when its cells change. Save to keep it; new shocks and responses copy it.
                Use <strong>Show chart</strong> and <strong>Show inputs</strong> to move around the sheet.
              </p>
              <p>
                <strong>Print / PDF</strong> opens worksheet print preview. Choose your paper settings, then Next,
                and select a printer or Save as PDF in your browser. It prints the worksheet and its charts;
                comparison cards and explanations are outside that printout.
              </p>
              <p>
                <strong>Export Excel</strong> downloads the saved scenario as an editable Excel workbook, including
                formulas and charts. Save any changes first. Its filename includes the scenario and saved revision.
                You can print and export a frozen baseline, but its inputs and charts remain read-only in KnockOn.
              </p>
            </section>

            <section id="example" aria-labelledby="example-h">
              <h2 id="example-h">A worked example</h2>
              <p>These are the fictional demo figures. Profit is per month.</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Scenario</th>
                      <th scope="col" className={styles.num}>
                        Profit
                      </th>
                      <th scope="col" className={styles.num}>
                        vs baseline
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <b>Baseline</b>
                        <span className={styles.sub}>Nothing has changed yet</span>
                      </td>
                      <td className={styles.num}>£700</td>
                      <td className={styles.num}>—</td>
                    </tr>
                    <tr>
                      <td>
                        <b>Shock</b>
                        <span className={styles.sub}>Energy rises from £400 to £600</span>
                      </td>
                      <td className={styles.num}>£500</td>
                      <td className={`${styles.num} ${styles.down}`}>−£200</td>
                    </tr>
                    <tr>
                      <td>
                        <b>Response 1</b>
                        <span className={styles.sub}>Price rises from £5 to £5.50, and you expect to sell 950 instead of 1,000</span>
                      </td>
                      <td className={styles.num}>£825</td>
                      <td className={`${styles.num} ${styles.up}`}>+£125</td>
                    </tr>
                    <tr>
                      <td>
                        <b>Response 2</b>
                        <span className={styles.sub}>New supplier at £1.80 a unit, with £100 a month for delivery</span>
                      </td>
                      <td className={styles.num}>£600</td>
                      <td className={`${styles.num} ${styles.down}`}>−£100</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                Both responses start from the shock, so they both include the higher energy cost. Response 1 beats the
                baseline, but only because you expect to keep 950 of your 1,000 sales. The result depends on that
                estimate, which is why KnockOn asks you for it.
              </p>
            </section>

            <section id="compare" aria-labelledby="compare-h">
              <h2 id="compare-h">Compare and inspect</h2>
              <p>
                <b>Compare</b> sits below the spreadsheet. It lists every scenario with its revenue, total costs, profit
                and margin, the change in profit against the baseline, and what changed. A chart shows the same figures.
                On a phone, each scenario is its own card.
              </p>
              <p>Compare uses saved results only. Save your edits to include them.</p>
              <p>
                To <b>inspect</b> a result, select it: a card above the spreadsheet, a figure in Compare, or a result
                cell in the sheet. KnockOn shows the formula and every input behind it, with their cells.
              </p>
            </section>

            <section id="explain" aria-labelledby="explain-h">
              <h2 id="explain-h">Explain</h2>
              <p>
                Select <b>✦&nbsp;Explain</b> on a saved scenario and Ling 3.2 Flash, an AI model, describes why the numbers
                look the way they do. It names the cells, says what changed from the scenario before and from the
                baseline, and lists the assumptions the result depends on.
              </p>
              <ul>
                <li>It only explains. It doesn’t calculate, change your figures or recommend a decision.</li>
                <li>It reads the saved figures, formulas and assumptions of that scenario, and nothing else.</li>
                <li>
                  If you save a change afterwards, the explanation is marked out of date. Select <b>Explain again</b> for
                  a new one.
                </li>
                <li>
                  You can ask for {limits.perVisitorPerHour} explanations an hour. There are also limits for each
                  network and for the whole site each day.
                </li>
                <li>If Ling is unavailable, everything else keeps working.</li>
              </ul>
              <p className={styles.note}>
                An explanation is written by AI, so check anything important against the formulas. It is not financial
                advice.
              </p>
            </section>

            <section id="saving" aria-labelledby="saving-h">
              <h2 id="saving-h">Saving</h2>
              <p>
                The <b>Save</b> button also shows the save status: <b>Save</b> when you have changes, <b>Saving…</b>,
                then <b>✓&nbsp;Saved</b>. On a keyboard, Ctrl+S saves. <b>Discard changes</b> goes back to the last saved
                version.
              </p>
              <ul>
                <li>KnockOn doesn’t save automatically. It asks before you leave a scenario with unsaved changes.</li>
                <li>
                  If a save fails, the button shows <b>Retry save</b> and a message says what needs fixing.
                </li>
                <li>
                  If the project was changed somewhere else, such as another tab, nothing is overwritten. KnockOn keeps
                  your draft and lets you apply it to the latest version, or discard it and reload.
                </li>
              </ul>
            </section>

            <section id="privacy" aria-labelledby="privacy-h">
              <h2 id="privacy-h">Privacy and your data</h2>
              <ul>
                <li>There are no accounts. You don’t give a name, an email address or a password.</li>
                <li>
                  Your projects belong to this browser. KnockOn stores a random ID in a cookie and keeps only a scrambled
                  copy of it with your projects. Nobody else can open them, even with the link.
                </li>
                <li>
                  If you clear your cookies, or use another browser or device, your list starts empty and the old
                  projects can’t be recovered.
                </li>
                <li>
                  When you select Explain, that scenario’s figures, formulas, assumptions and names are sent to Ling to
                  write the explanation.
                </li>
              </ul>
              <p className={styles.note}>
                KnockOn is a learning tool. Don’t rely on it as the only copy of figures you need to keep.
              </p>
            </section>

            <section id="limits" aria-labelledby="limits-h">
              <h2 id="limits-h">What KnockOn doesn’t do</h2>
              <ul>
                <li>It has one template, the bakery. You can’t add rows or change the formulas.</li>
                <li>Shocks and responses are the kinds listed above.</li>
                <li>You can’t delete projects or scenarios yet. Excel export covers one scenario at a time; full-project backup and import are not available.</li>
                <li>It doesn’t forecast, and it doesn’t give financial, legal or tax advice.</li>
              </ul>
            </section>

            <section id="questions" aria-labelledby="questions-h">
              <h2 id="questions-h">Common questions</h2>
              <dl className={styles.defs}>
                <div>
                  <dt>Why can’t I edit the baseline?</dt>
                  <dd>
                    It locks when you add the first shock, so every scenario is compared with the same starting point. To
                    change it, start a new project.
                  </dd>
                </div>
                <div>
                  <dt>Why does KnockOn ask for my expected sales?</dt>
                  <dd>
                    A price change usually changes how much you sell, and only you can judge by how much. KnockOn won’t
                    invent that number.
                  </dd>
                </div>
                <div>
                  <dt>Why does the sheet show the margin as 0.14?</dt>
                  <dd>The spreadsheet shows the margin as a fraction. The cards and Compare show it as 14.0%.</dd>
                </div>
                <div>
                  <dt>Why does the margin show N/A?</dt>
                  <dd>Revenue is zero, so there is nothing to divide by.</dd>
                </div>
                <div>
                  <dt>Why can’t I type in a cell?</dt>
                  <dd>
                    Only the eight blue input cells (<code>B2</code> to <code>B9</code>) can change. The baseline is
                    read-only once it is locked.
                  </dd>
                </div>
                <div>
                  <dt>Where did my projects go?</dt>
                  <dd>
                    They are tied to the browser that made them. Check that you’re in the same browser and haven’t cleared
                    its cookies.
                  </dd>
                </div>
              </dl>
            </section>

            <p className={styles.end}>
              <Link href="/projects" className="btn btn-primary">
                Open your projects
              </Link>
            </p>
          </article>
        </div>
      </main>
    </>
  );
}
