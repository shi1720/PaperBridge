import { useRef, useState } from "react";
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
  UserRound,
  Heart,
  Image,
  Bookmark,
  LayoutList,
  ScanSearch,
  Menu,
  X,
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
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  return (
    <div className="landing">
      <header
        className="landing-header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && navigationOpen) {
            setNavigationOpen(false);
            navigationToggle.current?.focus();
          }
        }}
      >
        <Link to="/" className="brand" aria-label="PaperBridge home">
          <BookOpen size={27} />
          paperbridge<span className="brand-period">.</span>
        </Link>
        <nav
          id="public-section-navigation"
          aria-label="Public navigation"
          className={navigationOpen ? "is-open" : undefined}
          onClick={() => setNavigationOpen(false)}
        >
          <a href="#how-it-works">Endorsement requests</a>
          <a href="#ai-review">AI review</a>
          <a href="#community">Community</a>
          <a href="#for-endorsers">For endorsers</a>
        </nav>
        <button className="button lp-signin" onClick={onSignIn}>
          Sign in <ArrowUpRight size={16} />
        </button>
        <button
          className="lp-nav-toggle"
          ref={navigationToggle}
          type="button"
          aria-label={navigationOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navigationOpen}
          aria-controls="public-section-navigation"
          onClick={() => setNavigationOpen((open) => !open)}
        >
          {navigationOpen ? <X size={21} /> : <Menu size={21} />}
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
            Your manuscript, the right people, and a clear next step. Find
            potential arXiv endorsers in your field, work through feedback on
            your PDF, and build a research community along the way.
          </p>
          <div className="landing-actions">
            <button
              className="button primary"
              onClick={() => onJoin("researcher")}
            >
              Create your research profile <ArrowRight size={17} />
            </button>
            <a className="landing-secondary" href="#find-endorsers">
              Find endorsement support <ArrowRight size={16} />
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
          <SlidersHorizontal size={17} /> Find potential endorsers
        </span>
        <span>
          <LockKeyhole size={17} /> Shared review workspaces
        </span>
        <span>
          <Sparkles size={17} /> Six-stage manuscript review
        </span>
        <span>
          <Users size={17} /> A social network for researchers
        </span>
      </div>

      <section
        className="lp-start-section"
        aria-labelledby="starting-point-title"
      >
        <div className="lp-start-intro">
          <p className="landing-eyebrow">THERE’S A PLACE FOR YOUR NEXT STEP</p>
          <h2 id="starting-point-title">Where are you in your research?</h2>
          <p>
            Start with what you need today. The rest of your workspace is there
            when you need it.
          </p>
        </div>
        <div className="lp-start-grid">
          <article>
            <span className="lp-start-icon">
              <FileText size={23} />
            </span>
            <span className="lp-micro">I’M WORKING ON A PAPER</span>
            <h3>A quieter place to think.</h3>
            <p>
              Read your PDF, highlight a passage, and turn notes into a stronger
              draft. Keep personal thoughts private and share feedback
              deliberately.
            </p>
            <button onClick={() => onJoin("researcher")}>
              Create a manuscript workspace <ArrowUpRight size={17} />
            </button>
          </article>
          <article>
            <span className="lp-start-icon">
              <Users size={23} />
            </span>
            <span className="lp-micro">I NEED ENDORSEMENT SUPPORT</span>
            <h3>Find a relevant connection.</h3>
            <p>
              Browse by arXiv category and availability. Share your manuscript
              with one researcher and keep the conversation in a dedicated
              review space.
            </p>
            <a href="#find-endorsers">
              Explore the endorsement workflow <ArrowUpRight size={17} />
            </a>
          </article>
          <article>
            <span className="lp-start-icon">
              <MessageSquare size={23} />
            </span>
            <span className="lp-micro">I CAN HELP OTHER RESEARCHERS</span>
            <h3>Make room for good ideas.</h3>
            <p>
              Set your fields and review capacity. Read before you decide, offer
              specific feedback, and pause new requests whenever you need to.
            </p>
            <button onClick={() => onJoin("endorser")}>
              Set up your endorser profile <ArrowUpRight size={17} />
            </button>
          </article>
        </div>
      </section>

      <section className="lp-flow landing-section" id="how-it-works">
        <div className="landing-section-heading">
          <div>
            <p className="landing-eyebrow">
              FROM MANUSCRIPT TO ENDORSEMENT REQUEST
            </p>
            <h2>
              Your next steps,
              <br />
              <em>all in one place.</em>
            </h2>
          </div>
          <p>
            No scattered email threads. Give a researcher the context to review
            your work, then keep feedback, revisions, and request status
            together.
          </p>
        </div>
        <ol className="lp-steps">
          <li>
            <span className="lp-step-number">01</span>
            <div>
              <h3>Filter for your arXiv category</h3>
              <p>
                Choose your manuscript’s category and filter participating
                endorsers by availability. Search names, institutions, and
                profile headlines to narrow your search.
              </p>
            </div>
          </li>
          <li>
            <span className="lp-step-number">02</span>
            <div>
              <h3>Send an endorsement request</h3>
              <p>
                Share a PDF in the researcher’s category, a short introduction,
                and your arXiv endorsement link if you have one. They can review
                your work and decide whether to help.
              </p>
            </div>
          </li>
          <li>
            <span className="lp-step-number">03</span>
            <div>
              <h3>Make the next draft better</h3>
              <p>
                Open the request’s shared workspace. Track its stage, read the
                PDF, reply to highlighted notes, and resolve feedback together.
                Upload a revision while keeping earlier notes with their
                version.
              </p>
            </div>
          </li>
        </ol>
        <div className="lp-collaboration-promise">
          <MessageSquare size={22} />
          <div>
            <strong>The conversation belongs with the paper.</strong>
            <p>
              Each request has its own in-app discussion, manuscript reader,
              shared notes, and activity history. Email notifications bring you
              back to the workspace. Your private notes remain yours.
            </p>
          </div>
        </div>
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
            <Sparkles size={16} /> FIVE SPECIALIST AGENTS. ONE REVISION PLAN.
          </p>
          <h2>
            See the passage.
            <br />
            <em>Know what to improve.</em>
          </h2>
          <p>
            Look beyond the abstract. Review the extracted manuscript for
            unsupported claims, attribution gaps, weaknesses in methods,
            formatting inconsistencies, and missing submission details. Five
            specialists feed one prioritized revision plan.
          </p>
          <div className="lp-agent-grid" aria-label="Five review specialties">
            <span>
              <ScanSearch size={15} /> Evidence & claims
            </span>
            <span>
              <BookOpen size={15} /> Attribution & novelty
            </span>
            <span>
              <SlidersHorizontal size={15} /> Methods & robustness
            </span>
            <span>
              <LayoutList size={15} /> Formatting & structure
            </span>
            <span>
              <ShieldCheck size={15} /> Submission readiness
            </span>
          </div>
          <ul className="lp-ai-benefits">
            <li>
              <Check size={16} /> Findings quote the manuscript passage they
              address.
            </li>
            <li>
              <Check size={16} /> Each concern includes a concrete suggested
              revision.
            </li>
            <li>
              <Check size={16} /> See text coverage and PDF extraction limits
              before you run a review.
            </li>
          </ul>
          <div className="lp-provider-note">
            <span>YOUR PROVIDER. YOUR MODELS.</span>
            <strong>OpenAI · Anthropic · Gemini</strong>
            <p>
              Choose a model for each specialist. GPT-6 Astra with medium
              reasoning is the recommended OpenAI setup when available on your
              account. Runs require your consent and use your provider billing.
            </p>
          </div>
        </div>
        <div className="lp-ai-output">
          <div className="lp-output-title">
            <Sparkles size={18} />
            <strong>AI manuscript review</strong>
            <span>Illustrative output</span>
          </div>
          <div className="lp-example-context">
            <FileText size={15} /> Example passages → concerns → revisions
          </div>
          {[
            {
              agent: "01 · Evidence lens",
              quote: "Our method improves accuracy by 12% on a single dataset.",
              concern: "12% relative to what?",
              revision:
                "State the baseline score and whether the gain is relative or in percentage points. Limit the conclusion to the dataset tested.",
            },
            {
              agent: "Formatting & structure",
              quote: "3. Results · 5. Discussion",
              concern: "Check the jump in section numbering.",
              revision:
                "Confirm whether a section is missing or misnumbered, then update the headings and cross-references together.",
            },
            {
              agent: "Methods & robustness",
              quote: "We select the best run from five random seeds.",
              concern: "Could the reported gain depend on the seed?",
              revision:
                "Report the mean and variation across all five runs, with the same evaluation protocol for the baseline.",
            },
          ].map((finding) => (
            <article className="lp-review-finding" key={finding.agent}>
              <span className="lp-finding-label">{finding.agent}</span>
              <blockquote>“{finding.quote}”</blockquote>
              <h3>{finding.concern}</h3>
              <p>
                <strong>Suggested revision:</strong> {finding.revision}
              </p>
            </article>
          ))}
          <div className="lp-synthesis">
            <span>
              <GitBranch size={17} /> Final stage · Your revision plan
            </span>
            <p>
              Prioritize the evaluation gap, clarify the reported improvement,
              then resolve the structure issue. Export the review and work
              through the supporting findings as you revise.
            </p>
          </div>
          <p className="lp-ai-caveat">
            Illustrative examples, not a live review. AI examines extracted text
            and PDF extraction measurements; it does not visually inspect
            figures or certify a venue’s formatting rules. Scans, equations, and
            literature coverage can be incomplete. It does not certify
            originality or replace peer review.
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
            Find potential endorsers.
            <br />
            <em>Make a relevant request.</em>
          </h2>
          <p>
            Filter directly by arXiv category and who is accepting requests.
            Read a researcher’s profile, check their stated fields, and send an
            endorsement request with your manuscript and introduction.
          </p>
          <ul>
            <li>
              <Check size={16} /> Introduce your work with a bio, headline, and
              research categories
            </li>
            <li>
              <Check size={16} /> Share your PDF privately with the researcher
              you select
            </li>
            <li>
              <Check size={16} /> Track pending requests, feedback, and your
              next revision
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
            Create your profile.
            <br />
            <em>Open a door.</em>
          </h2>
        </div>
        <div>
          <p>
            Help promising work find its next step. Add your research interests,
            bio, and arXiv author link. Publish an endorser profile so authors
            in your categories can find you and send a focused request.
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

      <section className="lp-community landing-section" id="community">
        <div className="landing-section-heading">
          <div>
            <p className="landing-eyebrow">
              <Users size={17} /> A SOCIAL NETWORK FOR RESEARCHERS
            </p>
            <h2>
              Find your people.
              <br />
              <em>Keep ideas moving.</em>
            </h2>
          </div>
          <p>
            Share the figure that started a question, a PDF others can read, or
            a milestone worth discussing. Build a research network through
            thoughtful posts, useful feedback, and conversations that continue.
          </p>
        </div>
        <div
          className="lp-community-preview"
          aria-label="Illustrative community attachments"
        >
          <div className="lp-social-preview-copy">
            <span className="lp-micro">MORE THAN A TEXT FEED</span>
            <h3>Put the work in the conversation.</h3>
            <p>
              Images, figures, and PDFs give people something specific to
              respond to. Add context, invite a question, and keep the
              discussion with the work.
            </p>
            <div className="lp-social-types">
              <span>Research update</span>
              <span>Question</span>
              <span>Paper</span>
              <span>Milestone</span>
            </div>
          </div>
          <figure className="lp-attachment-preview">
            <figcaption>Illustrative attachment preview</figcaption>
            <div className="lp-figure-placeholder">
              <Image size={30} />
              <strong>Your figure, with context.</strong>
              <span>Share an image and explain what matters.</span>
            </div>
            <div className="lp-pdf-attachment">
              <FileText size={25} />
              <div>
                <strong>Your research paper.pdf</strong>
                <span>Read the PDF inside the conversation</span>
              </div>
              <ArrowUpRight size={18} />
            </div>
            <div className="lp-social-actions">
              <span>
                <MessageSquare size={15} /> Discuss the details
              </span>
              <span>
                <Bookmark size={15} /> Save for later
              </span>
            </div>
          </figure>
        </div>
        <div className="lp-community-features">
          <article>
            <span className="lp-community-icon">
              <UserRound size={22} />
            </span>
            <h3>A profile for your research</h3>
            <p>
              Add your photo, research interests, background, and ORCID or arXiv
              link. Let people get to know the researcher behind the work. An
              institutional affiliation is optional.
            </p>
          </article>
          <article>
            <span className="lp-community-icon">
              <Heart size={22} />
            </span>
            <h3>A feed worth contributing to</h3>
            <p>
              Upload images and PDFs, ask a question, or share a milestone.
              Follow researchers, save useful posts, and return to the
              conversations that matter to your work.
            </p>
          </article>
          <article>
            <span className="lp-community-icon">
              <MessageSquare size={22} />
            </span>
            <h3>Conversations that go further</h3>
            <p>
              Message a researcher to exchange ideas or explore a collaboration.
              Keep private manuscript reviews separate from community posts,
              with reporting and blocking controls when you need them.
            </p>
          </article>
        </div>
        <div className="lp-community-entry">
          <div>
            <strong>
              Your next conversation could start with a good question.
            </strong>
            <p>
              Posts are visible to signed-in members. Your private manuscripts
              stay private.
            </p>
          </div>
          <Link className="button primary" to="/community">
            Explore the research community <ArrowUpRight size={17} />
          </Link>
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
          Your paper. Your people.
          <br />
          <em>Your next step.</em>
        </h2>
        <div className="landing-actions">
          <button
            className="button primary"
            onClick={() => onJoin("researcher")}
          >
            Create your profile <ArrowRight size={17} />
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
