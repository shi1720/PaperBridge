import type { Profile, RecordData } from "./types";
const now = Date.now();
export const demoProfile: Profile = {
  id: "demo-author",
  name: "Alex Morgan",
  role: "researcher",
  headline: "Independent researcher · Machine learning",
  institution: "Independent researcher",
  bio: "Exploring efficient and interpretable learning systems.",
  categories: ["cs.LG", "cs.AI"],
  acceptingRequests: false,
  weeklyCapacity: 3,
  publicProfile: true,
  arxivUrl: "",
  orcid: "",
};
export const demoPeople: Profile[] = [
  {
    id: "demo-1",
    name: "Maya Chen",
    role: "endorser",
    headline: "Making machine learning more interpretable",
    institution: "Example Institute of Technology",
    bio: "I work on interpretable machine learning and responsible AI. Happy to support thoughtful work from independent researchers. Please include your abstract and a short description of your contribution.",
    categories: ["cs.LG", "cs.AI", "stat.ML"],
    acceptingRequests: true,
    weeklyCapacity: 3,
    publicProfile: true,
    arxivUrl: "",
    orcid: "",
    color: "purple",
  },
  {
    id: "demo-2",
    name: "Oliver Reed",
    role: "endorser",
    headline: "Language, reasoning, and everything between",
    institution: "Example University",
    bio: "Research interests include natural language processing, reasoning and evaluation. I welcome concise, well-motivated manuscripts.",
    categories: ["cs.CL", "cs.AI"],
    acceptingRequests: true,
    weeklyCapacity: 2,
    publicProfile: true,
    arxivUrl: "",
    orcid: "",
    color: "orange",
  },
  {
    id: "demo-3",
    name: "Amara Okafor",
    role: "endorser",
    headline: "Understanding the structure of complex systems",
    institution: "Independent research lab",
    bio: "Working at the intersection of network science and statistical physics. Independent researchers are very welcome.",
    categories: ["physics.soc-ph", "cs.SI"],
    acceptingRequests: true,
    weeklyCapacity: 2,
    publicProfile: true,
    arxivUrl: "",
    orcid: "",
    color: "blue",
  },
  {
    id: "demo-4",
    name: "Leo Park",
    role: "endorser",
    headline: "New perspectives on computer vision",
    institution: "Example Research Centre",
    bio: "Computer vision and representation learning. I am currently catching up on my review queue.",
    categories: ["cs.CV", "cs.LG"],
    acceptingRequests: false,
    weeklyCapacity: 1,
    publicProfile: true,
    arxivUrl: "",
    orcid: "",
    color: "pink",
  },
  {
    id: "demo-5",
    name: "Sofia Alvarez",
    role: "endorser",
    headline: "Mathematics that connects ideas",
    institution: "Example University",
    bio: "Combinatorics, discrete mathematics, and the beautiful questions in between.",
    categories: ["math.CO", "cs.DM"],
    acceptingRequests: true,
    weeklyCapacity: 3,
    publicProfile: true,
    arxivUrl: "",
    orcid: "",
    color: "green",
  },
];
const papers: RecordData[] = [
  {
    id: "demo-paper",
    ownerId: "demo-author",
    downloadUrl: "/demo-manuscript.pdf",
    title: "Sparse pathways for interpretable language models",
    abstract:
      "We investigate whether sparse activation pathways improve the interpretability of compact language models while preserving downstream performance. This example manuscript illustrates the PaperBridge review workflow.",
    category: "cs.LG",
    authors: "Alex Morgan",
    visibility: "private",
    createdAt: now - 86400000,
    text: "Example manuscript. We evaluate sparse activation pathways on two synthetic benchmarks. Results suggest improved interpretability, but further evaluation on external datasets is needed.",
  },
];
const requests: RecordData[] = [
  {
    id: "demo-request",
    paperId: "demo-paper",
    title: papers[0].title,
    category: "cs.LG",
    requesterId: "demo-author",
    reviewerId: "demo-1",
    requesterName: "Alex Morgan",
    reviewerName: "Maya Chen",
    message:
      "I would appreciate your perspective on the evaluation and category fit.",
    status: "reviewing",
    createdAt: now - 86400000,
    updatedAt: now,
    endorsementUrl: "",
  },
];
const feed: RecordData[] = [
  {
    id: "post-1",
    authorId: "demo-1",
    authorName: "Maya Chen",
    body: "A small reminder for anyone working on their first paper: a clearly stated limitation is a strength. Tell us where your method works, where it breaks, and what you would try next.",
    category: "Research practice",
    createdAt: now - 3600000,
    likes: 24,
    commentCount: 0,
    liked: false,
  },
  {
    id: "post-2",
    authorId: "demo-3",
    authorName: "Amara Okafor",
    body: "Opening a few review slots this week for work on network science and complex systems. Independent researchers, you are welcome here. A good abstract and a specific question are a great place to start.",
    category: "Open to collaboration",
    createdAt: now - 7200000,
    likes: 18,
    commentCount: 0,
    liked: false,
  },
  {
    id: "post-3",
    authorId: "demo-2",
    authorName: "Oliver Reed",
    body: "What makes a useful peer review? For me: identify the central claim, check whether the evidence supports it, and leave the author with one concrete next step.",
    category: "Discussion",
    createdAt: now - 86400000,
    likes: 31,
    commentCount: 0,
    liked: false,
  },
];
const comments: Record<string, RecordData[]> = {
  "demo-request": [
    {
      id: "comment-1",
      authorId: "demo-1",
      authorName: "Maya Chen",
      body: "Thanks for sharing your work, Alex. Could you clarify how you selected the baseline models? A short ablation study would help strengthen the central claim.",
      createdAt: now - 3600000,
    },
  ],
};
const notes: RecordData[] = [],
  notifications: RecordData[] = [
    {
      id: "n1",
      title: "New feedback from Maya Chen",
      body: "Your request has moved to review.",
      createdAt: now,
      read: false,
      link: "/requests/demo-request",
    },
  ],
  chats: RecordData[] = [],
  following = new Set<string>();
export async function demoCall(action: string, p: any = {}): Promise<any> {
  const id = crypto.randomUUID();
  const stamped = {
    id,
    createdAt: Date.now(),
    authorId: demoProfile.id,
    authorName: demoProfile.name,
  };
  switch (action) {
    case "profile.get":
      return p.id
        ? demoPeople.find((x) => x.id === p.id) || demoProfile
        : demoProfile;
    case "profile.save":
      Object.assign(demoProfile, p.profile);
      return demoProfile;
    case "directory.list":
      return demoPeople.filter(
        (x) =>
          (!p.category || x.categories.includes(p.category)) &&
          (!p.search ||
            (x.name + " " + x.headline + " " + x.institution)
              .toLowerCase()
              .includes(p.search.toLowerCase())),
      );
    case "paper.list":
      return [...papers];
    case "paper.get":
      return papers.find((x) => x.id === p.id);
    case "paper.save": {
      const found = papers.find((x) => x.id === p.paper.id);
      if (found) Object.assign(found, p.paper);
      else papers.unshift({ ...stamped, ...p.paper, ownerId: demoProfile.id });
      return found || papers[0];
    }
    case "paper.delete":
      papers.splice(
        papers.findIndex((x) => x.id === p.id),
        1,
      );
      return { ok: true };
    case "request.list":
      return [...requests];
    case "request.get":
      return requests.find((x) => x.id === p.id);
    case "request.create": {
      const paper = papers.find((x) => x.id === p.paperId),
        person = demoPeople.find((x) => x.id === p.reviewerId);
      const row = {
        ...stamped,
        ...p,
        title: paper?.title,
        category: paper?.category,
        status: "pending",
        requesterId: demoProfile.id,
        requesterName: demoProfile.name,
        reviewerName: person?.name,
      };
      requests.unshift(row);
      return row;
    }
    case "request.status": {
      const row = requests.find((x) => x.id === p.id);
      if (row) row.status = p.status;
      return row;
    }
    case "request.messages":
    case "feed.comments":
    case "chat.messages":
      return comments[p.id] || [];
    case "request.comment":
    case "feed.comment":
    case "chat.send": {
      const row = {
        ...stamped,
        body: p.body,
        ...(action === "chat.send" ? { chatId: p.id } : {}),
      };
      (comments[p.id] ||= []).push(row);
      if (action === "feed.comment") {
        const post = feed.find((x) => x.id === p.id);
        if (post) post.commentCount = (post.commentCount || 0) + 1;
      }
      if (action === "chat.send") {
        const chat = chats.find((x) => x.id === p.id);
        if (chat) {
          chat.lastMessage = p.body;
          chat.updatedAt = Date.now();
          chat.lastMessageAt = row.createdAt;
          chat.lastMessageAuthorId = row.authorId;
        }
      }
      return row;
    }
    case "annotation.list":
      return notes.filter(
        (x) =>
          x.paperId === p.paperId &&
          (!p.requestId || !x.requestId || x.requestId === p.requestId),
      );
    case "annotation.reply": {
      const note = notes.find((x) => x.id === p.id);
      if (!note) throw Error("Note not found.");
      (note.replies ||= []).push({ ...stamped, body: p.body });
      return note;
    }
    case "annotation.resolve": {
      const note = notes.find((x) => x.id === p.id);
      if (!note) throw Error("Note not found.");
      Object.assign(note, {
        resolved: p.resolved,
        resolvedBy: p.resolved ? demoProfile.id : null,
        resolvedByName: p.resolved ? demoProfile.name : null,
        resolvedAt: p.resolved ? Date.now() : null,
      });
      return note;
    }
    case "annotation.save": {
      const existing = p.id
        ? notes.find((note) => note.id === p.id)
        : undefined;
      if (existing) {
        if (existing.authorId !== demoProfile.id)
          throw Error("You can edit only your notes.");
        Object.assign(existing, p, { updatedAt: Date.now() });
        return existing;
      }
      const row = { ...stamped, ...p };
      notes.push(row);
      return row;
    }
    case "annotation.delete":
      notes.splice(
        notes.findIndex((x) => x.id === p.id),
        1,
      );
      return { ok: true };
    case "feed.list": {
      const posts = feed.filter(
        (post) =>
          (!p.following || following.has(post.authorId)) &&
          (!p.saved || post.saved) &&
          (!p.authorId || post.authorId === p.authorId),
      );
      return p.includePageInfo
        ? { posts, nextCursor: null, hasMore: false }
        : posts;
    }
    case "feed.get":
      return feed.find((post) => post.id === p.id);
    case "feed.post": {
      const row = { ...stamped, ...p, likes: 0, commentCount: 0 };
      feed.unshift(row);
      return row;
    }
    case "feed.edit": {
      const row = feed.find((x) => x.id === p.id);
      if (!row || row.authorId !== demoProfile.id)
        throw Error("You can edit only your posts.");
      Object.assign(row, {
        body: p.body,
        postType: p.postType,
        updatedAt: Date.now(),
      });
      return row;
    }
    case "feed.save": {
      const row = feed.find((x) => x.id === p.id);
      if (row) row.saved = !row.saved;
      return { saved: !!row?.saved };
    }
    case "feed.like": {
      const row = feed.find((x) => x.id === p.id);
      if (row) {
        row.liked = !row.liked;
        row.likes += row.liked ? 1 : -1;
      }
      return row;
    }
    case "feed.delete":
      feed.splice(
        feed.findIndex((x) => x.id === p.id),
        1,
      );
      return { ok: true };
    case "follow.toggle":
      following.has(p.id) ? following.delete(p.id) : following.add(p.id);
      return { following: following.has(p.id) };
    case "follow.list":
      return [...following];
    case "chat.list":
      return [...chats].sort(
        (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
      );
    case "chat.read": {
      const chat = chats.find((x) => x.id === p.id);
      if (chat) {
        chat.unreadCount = 0;
        chat.lastReadAt = p.through || Date.now();
      }
      return {
        updated: true,
        unreadCount: 0,
        lastReadAt: p.through || Date.now(),
      };
    }
    case "chat.open": {
      let row = chats.find((x) => x.otherId === p.userId);
      if (!row) {
        row = {
          ...stamped,
          otherId: p.userId,
          name: demoPeople.find((x) => x.id === p.userId)?.name,
        };
        chats.push(row);
      }
      return row;
    }
    case "notifications.list":
      return [...notifications];
    case "notifications.read":
      notifications.forEach((x) => {
        if (!p.id || x.id === p.id) x.read = true;
      });
      return { ok: true };
    case "leaderboard.list":
      return demoPeople
        .slice(0, 3)
        .map((x, i) => ({ ...x, count: [12, 8, 6][i] }));
    case "block.list":
      return [];
    case "ai.settings":
      return { keys: [], agents: {} };
    case "ai.jobs":
      return [];
    case "ai.review":
      throw new Error(
        "AI analysis is available in your real account with your own API key. Demo manuscripts are not sent to a provider.",
      );
    case "report.create":
    case "block.toggle":
      return { ok: true };
    case "account.export":
      return { profile: demoProfile, papers, requests };
    default:
      throw new Error("Sign in to use this feature with your own research.");
  }
}
