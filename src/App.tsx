import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';

// Firebase configuration - USER MUST REPLACE WITH THEIR OWN
const firebaseConfig = {
  apiKey: "AIzaSyBWz1Q__tiAauJaiZX40hVej5JdCOREeDQ",
  authDomain: "blind-spot-1b06c.firebaseapp.com",
  projectId: "blind-spot-1b06c",
  storageBucket: "blind-spot-1b06c.firebasestorage.app",
  messagingSenderId: "997444451150",
  appId: "1:997444451150:web:28cf1b2ec19dd6cace3c1f",
  measurementId: "G-MMPJ2SL5N2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Access gate passcode
const COMMUNITY_PASSCODE = 'STUDENT2025';

// Board categories
const BOARDS = ['Random', 'Confessions', 'Faculty', 'Campus Life'];

// Generate tripcode from UID (5 characters)
const generateTripcode = (uid: string): string => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    const char = uid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let tripcode = '!';
  const hashStr = Math.abs(hash).toString();
  for (let i = 0; i < 4; i++) {
    const idx = parseInt(hashStr[i] || '0') + (parseInt(hashStr[i + 1] || '0') * 10);
    tripcode += chars[idx % chars.length];
  }
  return tripcode;
};

// Compress image to Base64 JPEG
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressed);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Extract video embed URL
const getVideoEmbedUrl = (url: string): string | null => {
  if (/youtube\.com\/watch\?v=([^&]+)/i.test(url)) {
    const match = url.match(/youtube\.com\/watch\?v=([^&]+)/i);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }
  if (/youtu\.be\/([^?]+)/i.test(url)) {
    const match = url.match(/youtu\.be\/([^?]+)/i);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }
  if (/vimeo\.com\/(\d+)/i.test(url)) {
    const match = url.match(/vimeo\.com\/(\d+)/i);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  }
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) {
    return url;
  }
  return null;
};

type Post = {
  id: string;
  board: string;
  title: string;
  content: string;
  authorTripcode: string;
  authorUid: string;
  imageUrl?: string;
  videoUrl?: string;
  timestamp: Timestamp;
  replies?: Post[];
  parentId?: string;
};

type Message = {
  id: string;
  content: string;
  authorTripcode: string;
  authorUid: string;
  imageUrl?: string;
  videoUrl?: string;
  timestamp: Timestamp;
};

type ViewMode = 'boards' | 'livewire';

const App: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [passcodeEntered, setPasscodeEntered] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [tripcode, setTripcode] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('boards');
  const [selectedBoard, setSelectedBoard] = useState<string>(BOARDS[0]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideoUrl, setPostVideoUrl] = useState('');
  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [messageImage, setMessageImage] = useState<string | null>(null);
  const [messageVideoUrl, setMessageVideoUrl] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const liveWireRef = useRef<HTMLDivElement>(null);
  const [postVotes, setPostVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [postScores, setPostScores] = useState<Record<string, number>>({});

  // Check authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setTripcode(generateTripcode(user.uid));
        setAuthenticated(true);
      } else {
        setUser(null);
        setTripcode('');
        setAuthenticated(false);
        setPasscodeEntered(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sign in anonymously
  const handleSignIn = async () => {
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Sign in error:', error);
      alert('Failed to sign in. Please check Firebase configuration.');
    }
  };

  // Burner mode - sign out
  const handleBurnerMode = async () => {
    try {
      await signOut(auth);
      setPasscodeEntered(false);
      setPasscodeInput('');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Handle passcode submission
  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput === COMMUNITY_PASSCODE) {
      setPasscodeEntered(true);
      if (!authenticated) {
        handleSignIn();
      }
    } else {
      alert('Invalid passcode. Access denied.');
      setPasscodeInput('');
    }
  };

  // Load posts from Firestore
  useEffect(() => {
    if (!authenticated || viewMode !== 'boards') return;

    const q = query(
      collection(db, 'posts'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPosts: Post[] = [];
      const postsMap = new Map<string, Post>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const post: Post = {
          id: doc.id,
          board: data.board || 'Random',
          title: data.title || '',
          content: data.content || '',
          authorTripcode: data.authorTripcode || '',
          authorUid: data.authorUid || '',
          imageUrl: data.imageUrl,
          videoUrl: data.videoUrl,
          timestamp: data.timestamp,
          parentId: data.parentId,
          replies: []
        };
        postsMap.set(doc.id, post);
      });

      // Build thread structure recursively
      const buildThread = (postId: string): Post[] => {
        const threadReplies: Post[] = [];
        postsMap.forEach((post) => {
          if (post.parentId === postId) {
            threadReplies.push(post);
          }
        });
        // Sort by timestamp (oldest first for replies)
        threadReplies.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        // Recursively build nested replies
        threadReplies.forEach((reply) => {
          reply.replies = buildThread(reply.id);
        });
        return threadReplies;
      };

      // Build top-level posts and their nested threads
      postsMap.forEach((post) => {
        if (!post.parentId) {
          post.replies = buildThread(post.id);
          allPosts.push(post);
        }
      });

      setPosts(allPosts);
    });

    return () => unsubscribe();
  }, [authenticated, viewMode]);

  // Load live wire messages
  useEffect(() => {
    if (!authenticated || viewMode !== 'livewire') return;

    const q = query(
      collection(db, 'messages'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          content: data.content || '',
          authorTripcode: data.authorTripcode || '',
          authorUid: data.authorUid || '',
          imageUrl: data.imageUrl,
          videoUrl: data.videoUrl,
          timestamp: data.timestamp
        });
      });
      setMessages(msgs.reverse()); // Reverse to show oldest first
    });

    return () => unsubscribe();
  }, [authenticated, viewMode]);

  // Auto-scroll live wire
  useEffect(() => {
    if (viewMode === 'livewire' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, viewMode]);

  // Submit post
  const handleSubmitPost = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    console.log('handleSubmitPost called', { user: !!user, tripcode, postContent: postContent.length, postImage: !!postImage, postVideoUrl });
    
    if (!user) {
      console.error('No user authenticated');
      alert('You must be logged in to post.');
      return;
    }

    const hasContent = postContent.trim().length > 0;
    const hasImage = !!postImage;
    const hasVideo = postVideoUrl.trim().length > 0;

    console.log('Validation check', { hasContent, hasImage, hasVideo });

    if (!hasContent && !hasImage && !hasVideo) {
      alert('Please enter some content, upload an image, or add a video URL.');
      return;
    }

    try {
      console.log('Attempting to add post to Firestore...');
      const docRef = await addDoc(collection(db, 'posts'), {
        board: selectedBoard,
        title: postTitle.trim() || 'Untitled',
        content: postContent.trim(),
        authorTripcode: tripcode,
        authorUid: user.uid,
        imageUrl: postImage || null,
        videoUrl: hasVideo ? postVideoUrl.trim() : null,
        timestamp: Timestamp.now(),
        parentId: replyTo?.id || null
      });
      console.log('Post submitted successfully with ID:', docRef.id);

      setPostTitle('');
      setPostContent('');
      setPostImage(null);
      setPostVideoUrl('');
      setReplyTo(null);
      setShowPostModal(false);
    } catch (error) {
      console.error('Error submitting post:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Full error details:', error);
      alert(`Failed to submit post: ${errorMessage}\n\nCheck console for details.`);
    }
  };

  // Submit message
  const handleSubmitMessage = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    console.log('handleSubmitMessage called', { user: !!user, tripcode, messageInput: messageInput.length, messageImage: !!messageImage, messageVideoUrl });
    
    if (!user) {
      console.error('No user authenticated');
      alert('You must be logged in to send messages.');
      return;
    }

    const hasContent = messageInput.trim().length > 0;
    const hasImage = !!messageImage;
    const hasVideo = messageVideoUrl.trim().length > 0;

    console.log('Validation check', { hasContent, hasImage, hasVideo });

    if (!hasContent && !hasImage && !hasVideo) {
      alert('Please enter some content, upload an image, or add a video URL.');
      return;
    }

    try {
      console.log('Attempting to add message to Firestore...');
      const docRef = await addDoc(collection(db, 'messages'), {
        content: messageInput.trim(),
        authorTripcode: tripcode,
        authorUid: user.uid,
        imageUrl: messageImage || null,
        videoUrl: hasVideo ? messageVideoUrl.trim() : null,
        timestamp: Timestamp.now()
      });
      console.log('Message submitted successfully with ID:', docRef.id);

      setMessageInput('');
      setMessageImage(null);
      setMessageVideoUrl('');
    } catch (error) {
      console.error('Error submitting message:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Full error details:', error);
      alert(`Failed to submit message: ${errorMessage}\n\nCheck console for details.`);
    }
  };

  // Handle image upload for posts
  const handlePostImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(file);
        setPostImage(compressed);
      } catch (error) {
        console.error('Error compressing image:', error);
        alert('Failed to process image.');
      }
    }
  };

  // Handle image upload for messages
  const handleMessageImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(file);
        setMessageImage(compressed);
      } catch (error) {
        console.error('Error compressing image:', error);
        alert('Failed to process image.');
      }
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Handle vote
  const handleVote = (postId: string, voteType: 'up' | 'down') => {
    const currentVote = postVotes[postId];
    const currentScore = postScores[postId] || 1;
    
    let newVote: 'up' | 'down' | null = voteType;
    let newScore = currentScore;
    
    if (currentVote === voteType) {
      // Toggle off
      newVote = null;
      newScore = currentScore - (voteType === 'up' ? 1 : -1);
    } else if (currentVote === null) {
      // New vote
      newScore = currentScore + (voteType === 'up' ? 1 : -1);
    } else {
      // Switch vote
      newScore = currentScore + (voteType === 'up' ? 2 : -2);
    }
    
    setPostVotes(prev => ({ ...prev, [postId]: newVote }));
    setPostScores(prev => ({ ...prev, [postId]: newScore }));
  };

  // Access gate screen - Dark Mode
  if (!passcodeEntered) {
    return (
      <div className="min-h-screen bg-[#030303] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1A1A1B] rounded-xl p-8 shadow-2xl border border-[#343536]">
          <h1 className="text-4xl font-bold text-[#D7DADC] mb-3 text-center tracking-tight">Blindspot</h1>
          <p className="text-[#818384] text-center mb-8 text-sm">Anonymous University Community</p>
          <form onSubmit={handlePasscodeSubmit} className="space-y-5">
            <div>
              <label className="block text-[#D7DADC] mb-2 font-bold text-sm">Enter Community Passcode</label>
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                className="w-full bg-[#272729] border border-[#343536] text-[#D7DADC] px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0079D3] focus:border-[#0079D3] placeholder:text-[#818384]"
                placeholder="Passcode"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#0079D3] hover:bg-[#0079D3]/90 text-white font-bold py-3.5 rounded-full transition-all hover:shadow-lg hover:shadow-[#0079D3]/20"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main app
  const filteredPosts = posts.filter(post => !post.parentId && post.board === selectedBoard);

  return (
    <div className="min-h-screen bg-[#030303] text-[#D7DADC]">
      {/* OPSEC Warning Banner */}
      <div className="bg-[#FF4500]/10 border-b border-[#FF4500]/30 px-4 py-2.5 text-sm text-center">
        <span className="font-semibold text-[#FF4500]">⚠️ OPSEC WARNING:</span>
        <span className="text-[#D7DADC] ml-2">
          Do not use University Wi-Fi. Switch to Mobile Data/VPN to avoid network traffic analysis.
        </span>
      </div>

      {/* Header - Dark Mode Reddit Style */}
      <div className="bg-[#1A1A1B] border-b border-[#343536] px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-5">
          <h1 className="text-2xl font-bold text-[#D7DADC] tracking-tight">Blindspot</h1>
          <span className="text-xs text-[#818384] font-mono bg-[#272729] px-3 py-1.5 rounded-md border border-[#343536]">Trip: {tripcode}</span>
        </div>
        <button
          onClick={handleBurnerMode}
          className="text-sm bg-[#FF4500] hover:bg-[#FF4500]/90 text-white px-4 py-2 rounded-full font-bold transition-all hover:shadow-lg hover:shadow-[#FF4500]/20"
        >
          Burner Mode
        </button>
      </div>

      {/* Boards View - Dark Mode Reddit Three Column Layout */}
      {viewMode === 'boards' && (
        <div className="flex max-w-[1400px] mx-auto">
          {/* Left Sidebar - Navigation */}
          <aside className="hidden lg:block w-72 bg-[#161617] border-r border-[#343536] sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto">
            <div className="p-4">
              <div className="mb-6">
                <h2 className="text-xs font-bold text-[#818384] uppercase mb-3 tracking-wider">Feeds</h2>
                <button className="w-full text-left px-4 py-2.5 rounded-md hover:bg-[#272729] text-[#D7DADC] font-medium flex items-center gap-3 transition-colors">
                  <span className="text-lg">🏠</span> <span>Home</span>
                </button>
                <button className="w-full text-left px-4 py-2.5 rounded-md hover:bg-[#272729] text-[#D7DADC] font-medium flex items-center gap-3 transition-colors">
                  <span className="text-lg">🔥</span> <span>Popular</span>
                </button>
              </div>
              <div>
                <h2 className="text-xs font-bold text-[#818384] uppercase mb-3 tracking-wider">Communities</h2>
                {BOARDS.map((board) => (
                  <button
                    key={board}
                    onClick={() => setSelectedBoard(board)}
                    className={`w-full text-left px-4 py-2.5 rounded-md hover:bg-[#272729] font-medium flex items-center gap-3 transition-colors ${
                      selectedBoard === board ? 'bg-[#272729] text-[#0079D3] border-l-2 border-[#0079D3]' : 'text-[#D7DADC]'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-[#0079D3] flex items-center justify-center text-white text-xs font-bold">r/</span>
                    <span>{board}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Center Column - Main Feed */}
          <main className="flex-1 max-w-[700px] mx-auto px-4">
            {/* Board Filter - Mobile */}
            <div className="lg:hidden bg-[#1A1A1B] border-b border-[#343536] px-4 py-3 overflow-x-auto mb-2">
              <div className="flex gap-2">
                {BOARDS.map((board) => (
                  <button
                    key={board}
                    onClick={() => setSelectedBoard(board)}
                    className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                      selectedBoard === board
                        ? 'bg-[#0079D3] text-white shadow-lg shadow-[#0079D3]/20'
                        : 'bg-[#272729] text-[#D7DADC] hover:bg-[#343536] border border-[#343536]'
                    }`}
                  >
                    r/{board}
                  </button>
                ))}
              </div>
            </div>

            {/* Posts Feed */}
            <div className="space-y-3 pb-24 pt-2">
              {filteredPosts.length === 0 ? (
                <div className="bg-[#1A1A1B] rounded-lg border border-[#343536] p-12 text-center">
                  <p className="text-[#818384] text-lg">No posts yet. Be the first to post!</p>
                </div>
              ) : (
                filteredPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onReply={(p) => {
                      setReplyTo(p);
                      setShowPostModal(true);
                    }}
                    formatTimestamp={formatTimestamp}
                    voteState={postVotes[post.id] || null}
                    score={postScores[post.id] || 1}
                    onVote={handleVote}
                  />
                ))
              )}
            </div>
          </main>

          {/* Right Sidebar - Context Panel */}
          <aside className="hidden xl:block w-80 bg-[#161617] border-l border-[#343536] sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto">
            <div className="p-5">
              <div className="bg-[#272729] rounded-lg border border-[#343536] p-5 mb-4 hover:border-[#454548] transition-colors">
                <h3 className="text-base font-bold text-[#D7DADC] mb-2">About r/{selectedBoard}</h3>
                <p className="text-sm text-[#818384] mb-4 leading-relaxed">A community for {selectedBoard.toLowerCase()} discussions.</p>
                <button className="w-full bg-[#0079D3] hover:bg-[#0079D3]/90 text-white font-bold py-2.5 px-4 rounded-full text-sm transition-all hover:shadow-lg hover:shadow-[#0079D3]/20">
                  Join
                </button>
              </div>
              <div className="bg-[#272729] rounded-lg border border-[#343536] p-5">
                <h3 className="text-xs font-bold text-[#818384] uppercase mb-3 tracking-wider">Community Rules</h3>
                <ul className="text-sm text-[#D7DADC] space-y-2.5 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-[#818384] mt-0.5">•</span>
                    <span>Be respectful to all members</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#818384] mt-0.5">•</span>
                    <span>Stay anonymous - no personal info</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#818384] mt-0.5">•</span>
                    <span>No doxxing or harassment</span>
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Live Wire View - Dark Mode */}
      {viewMode === 'livewire' && (
        <div className="max-w-3xl mx-auto px-4">
          <div ref={liveWireRef} className="h-[calc(100vh-180px)] overflow-y-auto space-y-3 pb-24 pt-4">
            {messages.map((msg) => (
              <div key={msg.id} className="bg-[#1A1A1B] rounded-lg border border-[#343536] p-4 hover:border-[#454548] transition-colors">
                <div className="flex items-center gap-1.5 mb-2 text-xs text-[#818384]">
                  <span className="font-bold text-[#D7DADC] hover:text-[#0079D3] cursor-pointer">u/{msg.authorTripcode}</span>
                  <span className="text-[#343536]">•</span>
                  <span>{formatTimestamp(msg.timestamp)}</span>
                </div>
                {msg.content && <p className="text-[#D7DADC] mb-3 text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>}
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Uploaded" className="max-w-full rounded-lg mb-2 border border-[#343536]" />
                )}
                {msg.videoUrl && (
                  <div className="rounded-lg overflow-hidden border border-[#343536]">
                    <VideoEmbed url={msg.videoUrl} />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Post Modal - Dark Mode */}
      {showPostModal && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-end z-50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPostModal(false);
              setReplyTo(null);
              setPostTitle('');
              setPostContent('');
              setPostImage(null);
              setPostVideoUrl('');
            }
          }}
        >
          <div 
            className="w-full bg-[#1A1A1B] rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto shadow-2xl border-t border-[#343536]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#D7DADC]">
                {replyTo ? `Reply to u/${replyTo.authorTripcode}` : 'Create a post'}
              </h2>
              <button
                onClick={() => {
                  setShowPostModal(false);
                  setReplyTo(null);
                  setPostTitle('');
                  setPostContent('');
                  setPostImage(null);
                  setPostVideoUrl('');
                }}
                className="text-[#818384] hover:text-[#D7DADC] w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[#272729] transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {replyTo && (
              <div className="bg-[#272729] rounded-lg border border-[#343536] p-4 mb-5">
                <div className="flex items-center gap-1.5 mb-2 text-xs text-[#818384]">
                  <span className="font-bold text-[#D7DADC]">u/{replyTo.authorTripcode}</span>
                  <span className="text-[#343536]">•</span>
                  <span>{formatTimestamp(replyTo.timestamp)}</span>
                </div>
                {replyTo.title && <p className="text-sm font-bold text-[#D7DADC] mb-2">{replyTo.title}</p>}
                {replyTo.content && (
                  <p className="text-sm text-[#D7DADC] whitespace-pre-wrap break-words line-clamp-3 leading-relaxed">
                    {replyTo.content}
                  </p>
                )}
                {replyTo.imageUrl && (
                  <p className="text-xs text-[#818384] mt-2 flex items-center gap-1">📷 <span>Image attached</span></p>
                )}
                {replyTo.videoUrl && (
                  <p className="text-xs text-[#818384] mt-2 flex items-center gap-1">🎥 <span>Video attached</span></p>
                )}
              </div>
            )}
            {!replyTo && (
              <input
                type="text"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-[#272729] border border-[#343536] text-[#D7DADC] px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[#0079D3] focus:border-[#0079D3] placeholder:text-[#818384]"
              />
            )}
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder={replyTo ? "Your reply..." : "Text (optional)"}
              rows={6}
              className="w-full bg-[#272729] border border-[#343536] text-[#D7DADC] px-4 py-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[#0079D3] focus:border-[#0079D3] resize-none placeholder:text-[#818384]"
            />
            <div className="space-y-4 mb-5">
              <label className="block">
                <span className="text-[#D7DADC] text-sm mb-2 block font-medium">Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePostImageUpload}
                  className="text-sm text-[#818384] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#0079D3] file:text-white hover:file:bg-[#0079D3]/90 file:cursor-pointer"
                />
                {postImage && (
                  <div className="mt-3 relative">
                    <img src={postImage} alt="Preview" className="max-w-full rounded-lg border border-[#343536]" />
                    <button
                      onClick={() => setPostImage(null)}
                      className="absolute top-2 right-2 bg-[#FF4500] hover:bg-[#FF4500]/90 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs transition-colors"
                      aria-label="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </label>
              <label className="block">
                <span className="text-[#D7DADC] text-sm mb-2 block font-medium">Video URL</span>
                <input
                  type="text"
                  value={postVideoUrl}
                  onChange={(e) => setPostVideoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#272729] border border-[#343536] text-[#D7DADC] px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0079D3] focus:border-[#0079D3] placeholder:text-[#818384]"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleSubmitPost}
              className="w-full bg-[#0079D3] hover:bg-[#0079D3]/90 text-white font-bold py-2.5 rounded-full transition-colors mt-2"
            >
              {replyTo ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {/* Live Wire Input - Dark Mode */}
      {viewMode === 'livewire' && (
        <div className="fixed bottom-20 left-0 right-0 bg-[#1A1A1B] border-t border-[#343536] p-4 z-40 shadow-2xl">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    handleSubmitMessage(e);
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-[#272729] text-[#D7DADC] px-4 py-2.5 rounded-full border border-[#343536] focus:outline-none focus:ring-2 focus:ring-[#0079D3] focus:border-[#0079D3] placeholder:text-[#818384]"
              />
              <label className="bg-[#272729] hover:bg-[#343536] px-3 py-2.5 rounded-full cursor-pointer transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center border border-[#343536]">
                📷
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMessageImageUpload}
                  className="hidden"
                />
              </label>
            </div>
            {messageImage && (
              <div className="relative mb-2">
                <img src={messageImage} alt="Preview" className="max-w-full rounded-lg max-h-32 border border-[#343536]" />
                <button
                  onClick={() => setMessageImage(null)}
                  className="absolute top-2 right-2 bg-[#FF4500] hover:bg-[#FF4500]/90 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs transition-colors"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            )}
            <input
              type="text"
              value={messageVideoUrl}
              onChange={(e) => setMessageVideoUrl(e.target.value)}
              placeholder="Video URL (optional)"
              className="w-full bg-[#272729] text-[#D7DADC] px-4 py-2.5 rounded-full border border-[#343536] mb-2 focus:outline-none focus:ring-2 focus:ring-[#0079D3] focus:border-[#0079D3] placeholder:text-[#818384]"
            />
            <button
              type="button"
              onClick={handleSubmitMessage}
              className="w-full bg-[#0079D3] hover:bg-[#0079D3]/90 text-white font-bold py-2.5 rounded-full transition-all min-h-[44px] hover:shadow-lg hover:shadow-[#0079D3]/20"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation - Dark Mode */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#1A1A1B] border-t border-[#343536] flex z-50 shadow-2xl lg:hidden">
        <button
          onClick={() => setViewMode('boards')}
          className={`flex-1 py-3 text-center transition-all font-bold ${
            viewMode === 'boards'
              ? 'bg-[#0079D3] text-white'
              : 'text-[#818384] hover:text-[#D7DADC] hover:bg-[#272729]'
          }`}
        >
          <span className="text-lg mb-1 block">📋</span>
          <span className="text-xs">Boards</span>
        </button>
        <button
          onClick={() => setViewMode('livewire')}
          className={`flex-1 py-3 text-center transition-all font-bold ${
            viewMode === 'livewire'
              ? 'bg-[#0079D3] text-white'
              : 'text-[#818384] hover:text-[#D7DADC] hover:bg-[#272729]'
          }`}
        >
          <span className="text-lg mb-1 block">⚡</span>
          <span className="text-xs">Live Wire</span>
        </button>
      </div>

      {/* Floating Action Button - Dark Mode */}
      {viewMode === 'boards' && (
        <button
          onClick={() => setShowPostModal(true)}
          className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 w-14 h-14 bg-[#0079D3] hover:bg-[#0079D3]/90 text-white rounded-full shadow-xl flex items-center justify-center text-2xl font-light transition-all z-40 hover:scale-110 active:scale-95 hover:shadow-[#0079D3]/40"
          aria-label="New post"
        >
          +
        </button>
      )}
    </div>
  );
};

// Post Card Component (Recursive for nested threads) - Reddit Style
const PostCard: React.FC<{
  post: Post;
  onReply: (post: Post) => void;
  formatTimestamp: (ts: Timestamp) => string;
  depth?: number;
  isReply?: boolean;
  voteState?: 'up' | 'down' | null;
  score?: number;
  onVote?: (postId: string, voteType: 'up' | 'down') => void;
}> = ({ post, onReply, formatTimestamp, depth = 0, isReply = false, voteState = null, score = 1, onVote }) => {
  const [showReplies, setShowReplies] = useState(true); // Default to showing replies
  const maxDepth = 10; // Prevent infinite nesting
  const borderColor = depth % 2 === 0 ? 'border-[#343536]' : 'border-[#454548]';

  // Count total nested replies recursively
  const countTotalReplies = (post: Post): number => {
    if (!post.replies || post.replies.length === 0) return 0;
    return post.replies.length + post.replies.reduce((sum, reply) => sum + countTotalReplies(reply), 0);
  };

  const totalReplies = countTotalReplies(post);
  const currentScore = score || 1;
  const currentVote = voteState || null;

  // Reddit-style post card - Dark Mode
  if (!isReply) {
    return (
      <div className="bg-[#1A1A1B] rounded-lg border border-[#343536] mb-3 hover:border-[#454548] transition-all shadow-sm">
        <div className="flex">
          {/* Vote Rail - Dark Mode */}
          <div className="vote-rail rounded-l-lg">
            <button
              onClick={() => onVote?.(post.id, 'up')}
              className={`vote-arrow ${currentVote === 'up' ? 'upvoted' : ''}`}
              aria-label="Upvote"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.877 19H7.123A1.13 1.13 0 016 17.877V11H2.126a1.166 1.166 0 01-1.007-1.757l4.872-8.154A1.07 1.07 0 016.86 1h6.278a1.07 1.07 0 01.869.089l4.872 8.154A1.166 1.166 0 0117.874 11H14v6.877A1.13 1.13 0 0112.877 19zM6 12v5.751l6.018.006L12 12h4.018l-4.872-8.154L6.86 4H2.126L6 12z" transform="rotate(180 10 10)"/>
              </svg>
            </button>
            <div className="vote-score">{currentScore}</div>
            <button
              onClick={() => onVote?.(post.id, 'down')}
              className={`vote-arrow ${currentVote === 'down' ? 'downvoted' : ''}`}
              aria-label="Downvote"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M12.877 19H7.123A1.13 1.13 0 016 17.877V11H2.126a1.166 1.166 0 01-1.007-1.757l4.872-8.154A1.07 1.07 0 016.86 1h6.278a1.07 1.07 0 01.869.089l4.872 8.154A1.166 1.166 0 0117.874 11H14v6.877A1.13 1.13 0 0112.877 19zM6 12v5.751l6.018.006L12 12h4.018l-4.872-8.154L6.86 4H2.126L6 12z"/>
              </svg>
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-4">
            {/* Header */}
            <div className="flex items-center gap-1.5 mb-3 text-xs text-[#818384]">
              <span className="font-bold text-[#D7DADC] hover:text-[#0079D3] cursor-pointer">r/{post.board}</span>
              <span className="text-[#343536]">•</span>
              <span>Posted by <span className="hover:text-[#0079D3] cursor-pointer">u/{post.authorTripcode}</span></span>
              <span className="text-[#343536]">•</span>
              <span>{formatTimestamp(post.timestamp)}</span>
            </div>

            {/* Title */}
            {post.title && (
              <h3 className="font-bold text-[#D7DADC] mb-3 text-xl leading-tight hover:text-[#0079D3] cursor-pointer">{post.title}</h3>
            )}

            {/* Content */}
            {post.content && (
              <p className="text-[#D7DADC] mb-4 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {post.content}
              </p>
            )}

            {/* Media */}
            {post.imageUrl && (
              <img src={post.imageUrl} alt="Post" className="max-w-full rounded mb-3" />
            )}
            {post.videoUrl && (
              <div className="mb-3 rounded overflow-hidden">
                <VideoEmbed url={post.videoUrl} />
              </div>
            )}

            {/* Action Footer */}
            <div className="flex items-center gap-6 text-xs text-[#818384] font-bold pt-2 border-t border-[#343536]">
              <button
                onClick={() => onReply(post)}
                className="flex items-center gap-1.5 hover:bg-[#272729] px-3 py-1.5 rounded-md transition-colors hover:text-[#D7DADC]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M12.877 19H7.123A1.13 1.13 0 016 17.877V11H2.126a1.166 1.166 0 01-1.007-1.757l4.872-8.154A1.07 1.07 0 016.86 1h6.278a1.07 1.07 0 01.869.089l4.872 8.154A1.166 1.166 0 0117.874 11H14v6.877A1.13 1.13 0 0112.877 19z"/>
                </svg>
                {totalReplies > 0 ? `${totalReplies} ${totalReplies === 1 ? 'Comment' : 'Comments'}` : 'Comment'}
              </button>
              <button className="flex items-center gap-1.5 hover:bg-[#272729] px-3 py-1.5 rounded-md transition-colors hover:text-[#D7DADC]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.5 1a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM11 2.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zm-.82 4.74a6 6 0 111.06 1.06l-2.47 2.47a1 1 0 01-1.06 0l-2.47-2.47a6 6 0 010-1.06zM8.9 12.5l1.06-1.06a.5.5 0 00-.7-.7L8.2 11.8a.5.5 0 00.7.7z"/>
                </svg>
                Share
              </button>
              <button className="flex items-center gap-1.5 hover:bg-[#272729] px-3 py-1.5 rounded-md transition-colors hover:text-[#D7DADC]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v13.5a.5.5 0 01-.777.416L8 13.101l-5.223 2.815A.5.5 0 012 15.5V2z"/>
                </svg>
                Save
              </button>
              {post.replies && post.replies.length > 0 && (
                <button
                  onClick={() => setShowReplies(!showReplies)}
                  className="flex items-center gap-1.5 hover:bg-[#272729] px-3 py-1.5 rounded-md transition-colors hover:text-[#D7DADC]"
                >
                  {showReplies ? '▼' : '▶'} {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>

            {/* Nested Replies */}
            {showReplies && post.replies && post.replies.length > 0 && depth < maxDepth && (
              <div className={`mt-4 ${depth > 0 ? 'pl-3' : 'pl-5'} border-l-2 ${borderColor} space-y-2`}>
                {post.replies.map((reply) => (
                  <PostCard
                    key={reply.id}
                    post={reply}
                    onReply={onReply}
                    formatTimestamp={formatTimestamp}
                    depth={depth + 1}
                    isReply={true}
                    voteState={voteState}
                    score={score}
                    onVote={onVote}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Reddit-style comment/reply - Dark Mode
  return (
    <div className={`relative ${depth > 0 ? 'ml-8' : ''} mb-3`}>
      {depth > 0 && (
        <div 
          className="thread-line"
          onClick={() => setShowReplies(!showReplies)}
        />
      )}
      <div className="bg-[#1A1A1B] rounded-lg border border-[#343536] p-3 hover:border-[#454548] transition-colors">
        <div className="flex items-center gap-1.5 mb-2 text-xs text-[#818384]">
          <span className="font-bold text-[#D7DADC] hover:text-[#0079D3] cursor-pointer">u/{post.authorTripcode}</span>
          <span className="text-[#343536]">•</span>
          <span>{formatTimestamp(post.timestamp)}</span>
        </div>
        {post.content && (
          <p className="text-[#D7DADC] mb-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {post.content}
          </p>
        )}
        {post.imageUrl && (
          <img src={post.imageUrl} alt="Reply" className="max-w-full rounded-lg mb-2 border border-[#343536]" />
        )}
        {post.videoUrl && (
          <div className="mb-2 rounded-lg overflow-hidden border border-[#343536]">
            <VideoEmbed url={post.videoUrl} />
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-[#818384] font-bold pt-2 border-t border-[#343536]">
          <button
            onClick={() => onReply(post)}
            className="hover:text-[#D7DADC] hover:bg-[#272729] px-2 py-1 rounded transition-colors"
          >
            Reply
          </button>
          {post.replies && post.replies.length > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="hover:text-[#D7DADC] hover:bg-[#272729] px-2 py-1 rounded transition-colors"
            >
              {showReplies ? '▼' : '▶'} {totalReplies} {totalReplies === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
        {showReplies && post.replies && post.replies.length > 0 && depth < maxDepth && (
          <div className={`mt-2 ${depth > 0 ? 'pl-3' : 'pl-5'} border-l-2 ${borderColor} space-y-2`}>
            {post.replies.map((reply) => (
              <PostCard
                key={reply.id}
                post={reply}
                onReply={onReply}
                formatTimestamp={formatTimestamp}
                depth={depth + 1}
                isReply={true}
                voteState={voteState}
                score={score}
                onVote={onVote}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Video Embed Component - Dark Mode
const VideoEmbed: React.FC<{ url: string }> = ({ url }) => {
  const embedUrl = getVideoEmbedUrl(url);
  
  if (!embedUrl) {
    return (
      <div className="bg-[#272729] rounded-lg p-4 text-center text-[#818384] border border-[#343536]">
        Invalid video URL
      </div>
    );
  }

  if (embedUrl.includes('youtube.com/embed') || embedUrl.includes('vimeo.com/video')) {
    return (
      <div className="relative w-full pb-[56.25%] rounded overflow-hidden">
        <iframe
          src={embedUrl}
          className="absolute top-0 left-0 w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Direct video file
  return (
    <video
      src={embedUrl}
      controls
      className="w-full rounded"
      style={{ maxHeight: '400px' }}
    />
  );
};

export default App;

