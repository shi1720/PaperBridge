import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  MessageSquare,
  LockKeyhole,
  SlidersHorizontal,
  Check,
  Sparkles,
  Users,
  ExternalLink,
  Highlighter,
  GitBranch,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { serviceReady } from "../lib/firebase";
import "./landing.css";

/** Editorial product illustrations: no live data or interactive simulated controls. */
function WorkspacePreview() {
  return (
    <figure
      className="lp-workspace"
      aria-label="Illustrative private manuscript workspace"
    >
      <figcaption>
        <span className="lp-live-dot" /> INSIDE PAPERBRIDGE{" "}
        <span>Illustrative workspace</span>
      </figcaption>
      <div className="lp-window">
        <div className="lp-window-top">
          <BookOpen size={17} />
          <strong>My manuscripts</strong>
          <ChevronRight size={13} />
          <span>Working draft</span>
          <LockKeyhole size={14} />
        </div>
        <div className="lp-document-heading">
          <div>
            <span className="lp-micro">MANUSCRIPT / VERSION 02</span>
            <h2>A closer look at your research.</h2>
          </div>
          <span className="lp-private">
            <LockKeyhole size={11} /> Private
          </span>
        </div>
        <div className="lp-document-tabs">
          <span className="selected">Manuscript</span>
          <span>AI review</span>
          <span>Version history</span>
        </div>
        <div className="lp-reading-space">
          <div className="lp-paper-sheet">
            <div className="lp-paper-running">
              WORKING DRAFT <span>02</span>
            </div>
            <h3>3. Methods & assumptions</h3>
            <p>
              A clear argument makes its assumptions visible. Each result should
              connect to the evidence that supports it.
            </p>
            <p>
              <mark>
                The observed effect remains consistent across the tested
                conditions.
              </mark>
            </p>
            <p>
              Describe the comparison, the limits of the sample, and the
              conditions under which the result may change.
            </p>
            <div className="lp-paper-rule" />
            <span className="lp-paper-page">2</span>
          </div>
          <aside className="lp-annotation">
            <div className="lp-note-heading">
              <Highlighter size={15} />
              <strong>Shared annotation</strong>
            </div>
            <span className="lp-note-location">
              Page 2 · Highlighted passage
            </span>
            <blockquote>“across the tested conditions”</blockquote>
            <p>
              Which conditions? Add the range here so a reader can assess the
              claim.
            </p>
            <div className="lp-note-footer">
              <MessageSquare size={13} /> Feedback stays with the passage
            </div>
          </aside>
        </div>
        <div className="lp-request-track">
          <div>
            <span className="lp-status-dot" />
            <strong>Review in progress</strong>
          </div>
          <span>Request → Conversation → Revision</span>
        </div>
      </div>
      <div className="lp-preview-caption">
        <span>
          <Highlighter size={15} /> Highlight the detail.
        </span>
        <span>
          <MessageSquare size={15} /> Keep the context.
        </span>
      </div>
    </figure>
  );
}

export function Landing({
  onJoin,
  onSignIn,
  onPrivacy,
}: {
  onJoin: (role: "researcher" | "endorser") => void;
  onSignIn: () => void;
  onPrivacy: () => void;
}) {
  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="brand" aria-label="PaperBridge home">
          <BookOpen size={27} />
          paperbridge<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Public navigation">
          <a href="#how-it-works">The workflow</a>
          <a href="#ai-review">AI review</a>
          <a href="#for-endorsers">For endorsers</a>
        </nav>
        <button className="button lp-signin" onClick={onSignIn}>
          Sign in <ArrowUpRight size={16} />
        </button>
      </header>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">
            <span /> INDEPENDENT MINDS. SHARED PROGRESS.
          </p>
          <h1>
            Build a stronger paper.
            <br />
            <em>
              Find your path
              <br className="lp-desktop-break" /> to arXiv.
            </em>
          </h1>
          <p className="landing-intro">
            Find potential arXiv endorsers by research category. Share your
            draft privately, get feedback in the margins, and bring your next
            revision into focus.
          </p>
          <div className="landing-actions">
            <button
              className="button primary"
              onClick={() => onJoin("researcher")}
            >
              I’m working on a paper <ArrowRight size={17} />
            </button>
            <a className="landing-secondary" href="#find-endorsers">
              How connections work <ArrowRight size={16} />
            </a>
          </div>
          <p className="landing-hero-note">
            <Check size={15} /> No institutional affiliation required.
          </p>
          {!serviceReady && (
            <p className="landing-availability" role="status">
              <span>PREPARING FOR LAUNCH</span>Account registration is not open
              yet. Explore what’s inside below.
            </p>
          )}
        </div>
        <WorkspacePreview />
      </section>
      <div className="lp-capability-bar" aria-label="Workspace capabilities">
        <span>
          <SlidersHorizontal size={17} /> Category-based discovery
        </span>
        <span>
          <LockKeyhole size={17} /> Private PDF collaboration
        </span>
        <span>
          <Sparkles size={17} /> Optional AI review
        </span>
        <span>
          <GitBranch size={17} /> Manuscript version history
        </span>
      </div>

      <section className="lp-flow landing-section" id="how-it-works">
        <div className="landing-section-heading">
          <div>
            <p className="landing-eyebrow">FROM DRAFT TO DIALOGUE</p>
            <h2>
              You have the research.
              <br />
              <em>Here’s the next step.</em>
            </h2>
          </div>
          <p>
            Finding a relevant person is only the beginning. Keep the
            manuscript, the request, and the conversation connected.
          </p>
        </div>
        <ol className="lp-steps">
          <li>
            <span className="lp-step-number">01</span>
            <div>
              <h3>Find the right field</h3>
              <p>
                Choose your arXiv categories. Discover participating researchers
                by expertise and availability.
              </p>
            </div>
          </li>
          <li>
            <span className="lp-step-number">02</span>
            <div>
              <h3>Start with your work</h3>
              <p>
                Send a focused introduction with a private manuscript. The
                recipient decides whether they can help.
              </p>
            </div>
          </li>
          <li>
            <span className="lp-step-number">03</span>
            <div>
              <h3>Make the next draft better</h3>
              <p>
                Discuss the details, share PDF annotations, and keep track of
                revisions in one workspace.
              </p>
            </div>
          </li>
        </ol>
        <div className="lp-arxiv-handoff">
          <ExternalLink size={17} />
          <p>
            <strong>The final endorsement happens on arXiv.</strong> PaperBridge
            is independent of arXiv. An offer to help is not an endorsement or a
            guarantee of acceptance.
          </p>
          <a
            href="https://info.arxiv.org/help/endorsement.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Read arXiv endorsement guidance"
          >
            <ArrowUpRight size={19} />
          </a>
        </div>
      </section>

      <section className="lp-ai-section" id="ai-review">
        <div className="lp-ai-copy">
          <p className="landing-eyebrow">
            <Sparkles size={16} /> ANOTHER SET OF EYES
          </p>
          <h2>
            Put your argument
            <br />
            <em>under the lens.</em>
          </h2>
          <p>
            Before you ask someone else to read, give your draft a structured AI
            review. Look for gaps in evidence, attribution, and reasoning—then
            decide what deserves a revision.
          </p>
          <div className="lp-provider-note">
            <span>YOUR PROVIDER. YOUR MODELS.</span>
            <strong>OpenAI · Anthropic · Gemini</strong>
            <p>
              Connect your own API keys. Choose models for each lens. Review
              runs only with your consent; provider charges may apply.
            </p>
          </div>
        </div>
        <div className="lp-ai-output">
          <div className="lp-output-title">
            <Sparkles size={18} />
            <strong>AI manuscript review</strong>
            <span>Illustrative output</span>
          </div>
          <div className="lp-review-lenses">
            <span>01 Evidence lens</span>
            <span>02 Attribution lens</span>
            <span>03 Critical reader</span>
          </div>
          <div className="lp-review-finding">
            <span className="lp-finding-label">
              EVIDENCE LENS / QUESTION TO CHECK
            </span>
            <h3>Does the conclusion extend beyond the experiment?</h3>
            <p>
              Compare the scope of the claim with the conditions described in
              Methods. State where the evidence ends.
            </p>
            <div>
              <FileText size={14} /> Ground the revision in your manuscript
            </div>
          </div>
          <div className="lp-synthesis">
            <span>
              <GitBranch size={17} /> 04 · Synthesis
            </span>
            <p>
              Bring the three perspectives into a prioritized review you can
              inspect.
            </p>
          </div>
          <p className="lp-ai-caveat">
            AI findings can be wrong. This is research assistance, not peer
            review, originality certification, or a decision about arXiv
            eligibility.
          </p>
        </div>
      </section>

      <section className="lp-discovery landing-section" id="find-endorsers">
        <div
          className="lp-discovery-visual"
          aria-label="Illustration of directory search filters"
        >
          <div className="lp-filter-caption">
            <SlidersHorizontal size={17} />
            <strong>A relevant starting point</strong>
            <span>Directory filters</span>
          </div>
          <div className="lp-filter-field">
            <span>RESEARCH CATEGORY</span>
            <strong>
              cs.LG <span>Machine Learning</span>
            </strong>
          </div>
          <div className="lp-filter-field">
            <span>AVAILABILITY</span>
            <strong>
              <span className="lp-status-dot" /> Accepting requests
            </strong>
          </div>
          <div className="lp-filter-bottom">
            <Users size={19} />
            <p>
              Discover people who choose to participate.
              <br />
              <strong>No match or response is guaranteed.</strong>
            </p>
          </div>
        </div>
        <div className="lp-discovery-copy">
          <p className="landing-eyebrow">RELEVANCE BEFORE REACH</p>
          <h2>
            Start in your field.
            <br />
            <em>Make a specific ask.</em>
          </h2>
          <p>
            Skip the scattered search. Filter participating endorser profiles by
            arXiv category and availability, then send a request with the
            context a researcher needs.
          </p>
          <ul>
            <li>
              <Check size={16} /> A research profile beyond your affiliation
            </li>
            <li>
              <Check size={16} /> A manuscript attached to your introduction
            </li>
            <li>
              <Check size={16} /> Request status and private conversation
              together
            </li>
          </ul>
          <Link className="landing-secondary" to="/discover">
            Explore the research directory <ArrowUpRight size={16} />
          </Link>
          <small className="lp-directory-note">
            Sign in to view participating profiles.
          </small>
        </div>
      </section>

      <section className="lp-endorser" id="for-endorsers">
        <div>
          <p className="landing-eyebrow">FOR RESEARCHERS WHO CAN HELP</p>
          <h2>
            Open a door.
            <br />
            <em>On your terms.</em>
          </h2>
        </div>
        <div>
          <p>
            You know how much the right conversation can matter. Make yourself
            discoverable in your field, read a draft, and decide where you can
            contribute.
          </p>
          <ul>
            <li>
              <Check size={17} /> Set your categories and a weekly request limit
            </li>
            <li>
              <Check size={17} /> Pause requests when your schedule is full
            </li>
            <li>
              <Check size={17} /> Read privately before deciding whether to help
            </li>
          </ul>
          <button className="button" onClick={() => onJoin("endorser")}>
            Join as an endorser <ArrowRight size={17} />
          </button>
          <small>
            Eligibility is self-attested here. Confirm it directly on arXiv.
          </small>
        </div>
      </section>

      <section className="lp-trust landing-section">
        <div>
          <p className="landing-eyebrow">
            <ShieldCheck size={17} /> YOUR WORK, YOUR DECISION
          </p>
          <h2>
            Unpublished research
            <br />
            needs <em>clear boundaries.</em>
          </h2>
          <button className="landing-secondary" onClick={onPrivacy}>
            Guidelines & privacy <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="lp-faq">
          <details open>
            <summary>Who can read my manuscript?</summary>
            <p>
              Manuscripts are private by default. A request gives the researcher
              you select access to your work. Keep personal notes private or
              share annotations with review participants.
            </p>
          </details>
          <details>
            <summary>Can I withdraw access?</summary>
            <p>
              Withdrawing stops new access links; existing links expire within
              ten minutes. Copies already downloaded cannot be recalled.
            </p>
          </details>
          <details>
            <summary>Is AI review required?</summary>
            <p>
              No. You can use the research and collaboration tools without AI.
              If you choose a review, manuscript text is sent to your selected
              providers only with your consent. Your provider may charge for
              use.
            </p>
          </details>
          <details>
            <summary>Does PaperBridge provide arXiv endorsement?</summary>
            <p>
              No. PaperBridge helps researchers connect and discuss work.
              Endorsement eligibility must be checked on arXiv, and the official
              endorsement takes place there. Participation does not guarantee
              endorsement, peer review, or acceptance.
            </p>
          </details>
        </div>
      </section>

      <section className="landing-final">
        <p className="landing-eyebrow">
          FOR RESEARCHERS, WITH OR WITHOUT AN INSTITUTION
        </p>
        <h2>
          Start with your manuscript.
          <br />
          <em>See where the work can go.</em>
        </h2>
        <div className="landing-actions">
          <button
            className="button primary"
            onClick={() => onJoin("researcher")}
          >
            Join as a researcher <ArrowRight size={17} />
          </button>
          <a className="landing-secondary" href="#for-endorsers">
            I’d like to help researchers <ArrowUpRight size={17} />
          </a>
        </div>
      </section>
      <div className="landing-footer">
        <Link to="/" className="brand">
          <BookOpen size={21} />
          paperbridge.
        </Link>
        <span>Independent research. Connected.</span>
        <button onClick={onPrivacy}>Guidelines & privacy</button>
      </div>
    </div>
  );
}
