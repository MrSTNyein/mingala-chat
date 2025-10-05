import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// app.js v3.3 - Secure Key Management & Final Polish

document.addEventListener('DOMContentLoaded', () => {
    const loginMessage = document.getElementById('login-message');
    try {
        // --- 1. SUPABASE SETUP ---
        // The hardcoded keys are removed. 
        // This script now uses the SUPABASE_URL and SUPABASE_KEY variables
        // from the untracked config.js file.
        const { createClient } = supabase;
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

        console.log("App initialized.");

        // --- 2. DOM ELEMENTS ---
        const appContainer = document.getElementById('app-container');
        const loginOverlay = document.getElementById('login-overlay');
        const btnGoogleLogin = document.getElementById('btn-google-login');
        const btnGuestLogin = document.getElementById('btn-guest-login');
        const btnLogout = document.getElementById('btn-logout');
        const btnNewChat = document.getElementById('btn-new-chat');
        const userInfo = document.getElementById('user-info');
        const userPic = document.getElementById('user-pic');
        const userName = document.getElementById('user-name');
        const chatList = document.getElementById('chat-list');
        const chatWindow = document.getElementById('chat-window');
        const chatStarter = document.getElementById('chat-starter');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const btnTheme = document.getElementById('btn-theme');

        // --- 3. APP STATE ---
        let currentUser = null;
        let currentChatId = null;
        let messageSubscription = null;
        const BOT_ID = '00000000-0000-0000-0000-000000000000'; 

        // --- 4. THEME MANAGEMENT ---
        const applyTheme = (theme) => {
            if (theme === 'light') {
                document.body.classList.add('light');
                btnTheme.textContent = 'Dark';
            } else {
                document.body.classList.remove('light');
                btnTheme.textContent = 'Light';
            }
            localStorage.setItem('chat-theme', theme);
        };

        const loadTheme = () => {
            const savedTheme = localStorage.getItem('chat-theme') || 'dark'; // Default to dark
            applyTheme(savedTheme);
        };

        btnTheme.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('light') ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });

        // --- 5. AUTHENTICATION ---
        const signInWithGoogle = async () => { await supabaseClient.auth.signInWithOAuth({ provider: 'google' }); };
        const signInAsGuest = async () => {
            try {
                loginMessage.textContent = "Signing in as guest...";
                loginMessage.style.color = '';
                const { error } = await supabaseClient.auth.signInAnonymously();
                if (error) throw error;
            } catch (err) {
                loginMessage.textContent = `Guest Login Error: ${err.message}`;
                loginMessage.style.color = '#ef4444';
            }
        };
        const signOut = async () => {
            if (messageSubscription) messageSubscription.unsubscribe();
            await supabaseClient.auth.signOut();
            currentUser = null;
            currentChatId = null;
            updateUI(null);
        };

        supabaseClient.auth.onAuthStateChange((event, session) => {
            const user = session?.user || null;
            currentUser = user;
            updateUI(user);
        });
        
        // --- 6. UI MANAGEMENT ---
        const updateUI = async (user) => {
            if (user) {
                appContainer.classList.remove('hidden');
                loginOverlay.classList.add('hidden');
                btnLogout.classList.remove('hidden');
                userInfo.classList.remove('hidden');
                
                if (user.is_anonymous) {
                    userPic.style.display = 'none';
                    userName.textContent = 'Guest User';
                } else {
                    userPic.style.display = 'block';
                    userPic.src = user.user_metadata.avatar_url || '';
                    userName.textContent = user.user_metadata.full_name || 'User';
                }
                await loadChatSessions();
                if (!currentChatId) {
                    showStarterView();
                }
            } else {
                appContainer.classList.add('hidden');
                loginOverlay.classList.remove('hidden');
                chatList.innerHTML = '';
            }
        };

        const loadChatSessions = async () => {
            if (!currentUser) return;
            const { data, error } = await supabaseClient
                .from('chats')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) { console.error("Error loading chats:", error); return; }
            
            chatList.innerHTML = '';
            data.forEach(chat => {
                const chatEl = document.createElement('div');
                chatEl.className = 'chat-list-item';
                chatEl.textContent = chat.title || 'New Chat';
                chatEl.dataset.id = chat.id;
                chatEl.addEventListener('click', () => loadChat(chat.id));
                chatList.appendChild(chatEl);
            });
        };

        const showStarterView = () => {
            currentChatId = null;
            if (messageSubscription) messageSubscription.unsubscribe();
            chatWindow.innerHTML = ''; 
            chatWindow.appendChild(chatStarter); 
            chatStarter.style.display = 'flex';
            document.querySelectorAll('.chat-list-item.active').forEach(el => el.classList.remove('active'));
            messageInput.value = '';
            messageInput.disabled = true; 
            sendButton.disabled = true;
        };

        // --- 7. CORE CHAT LOGIC ---
        const startNewChat = () => {
            showStarterView();
            messageInput.disabled = false;
            messageInput.focus();
        };

        const loadChat = async (chatId) => {
            if (currentChatId === chatId) return;
            currentChatId = chatId;
            chatStarter.style.display = 'none';
            chatWindow.innerHTML = ''; 
            messageInput.disabled = false;
            
            const { data, error } = await supabaseClient.from('messages').select('*').eq('chat_id', chatId).order('created_at');
            if (error) { console.error("Error loading messages:", error); return; }
            data.forEach(renderMessage);

            document.querySelectorAll('.chat-list-item').forEach(el => {
                el.classList.toggle('active', el.dataset.id === String(chatId));
            });
            
            subscribeToMessages(chatId);
            messageInput.focus();
        };

        const sendMessage = async () => {
            const text = messageInput.value.trim();
            if (text.length === 0 || !currentUser) return;
            
            chatStarter.style.display = 'none';
            const originalInputValue = messageInput.value;
            messageInput.value = '';
            messageInput.style.height = 'auto';
            sendButton.disabled = true;

            try {
                let chatId = currentChatId;
                if (!chatId) {
                    const { data, error } = await supabaseClient.from('chats').insert({ title: text.substring(0, 40), user_id: currentUser.id }).select().single();
                    if (error) throw new Error(`Error creating chat: ${error.message}`);
                    chatId = data.id;
                    currentChatId = chatId;
                    await loadChatSessions(); 
                    document.querySelector(`.chat-list-item[data-id="${chatId}"]`)?.classList.add('active');
                    subscribeToMessages(chatId);
                }

                const { error: msgError } = await supabaseClient.from('messages').insert({ chat_id: chatId, text, sender_id: currentUser.id });
                if (msgError) throw new Error(`Error saving message: ${msgError.message}`);

                await getAndSaveBotResponse(chatId, userText);
            } catch (error) {
                console.error("Failed to send message:", error);
                messageInput.value = originalInputValue;
            }
        };
        
        const getAndSaveBotResponse = async (chatId, userText) => {
            const botText = `You said: "${userText}". This is a placeholder response.`;
            const { error } = await supabaseClient.from('messages').insert({ chat_id: chatId, text: botText, sender_id: BOT_ID });
            if (error) console.error("Error saving bot response:", error);
        };

        const renderMessage = (message) => {
            const senderClass = (currentUser && message.sender_id === currentUser.id) ? 'user' : 'bot';
            const messageRow = document.createElement('div');
            messageRow.className = `chat-row ${senderClass}`;
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            const sanitizedText = message.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            bubble.innerHTML = marked.parse(sanitizedText);
            bubble.querySelectorAll('pre code').forEach(hljs.highlightElement);
            messageRow.appendChild(bubble);
            chatWindow.appendChild(messageRow);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };
        
        const subscribeToMessages = (chatId) => {
            if (messageSubscription) messageSubscription.unsubscribe();
            messageSubscription = supabaseClient.channel(`chat:${chatId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, payload => {
                    if (payload.new.sender_id !== currentUser.id) {
                            renderMessage(payload.new);
                    }
                })
                .subscribe();
        };

        // --- 8. EVENT LISTENERS & INITIALIZATION ---
        btnGoogleLogin.addEventListener('click', signInWithGoogle);
        btnGuestLogin.addEventListener('click', signInAsGuest);
        btnLogout.addEventListener('click', signOut);
        btnNewChat.addEventListener('click', startNewChat);
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        messageInput.addEventListener('input', () => {
            sendButton.disabled = messageInput.value.trim().length === 0;
            messageInput.style.height = 'auto';
            messageInput.style.height = `${messageInput.scrollHeight}px`;
        });
        
        loadTheme(); // Load the saved theme when the app starts

    } catch (err) {
        // A check to ensure config.js is loaded
        if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_KEY === 'undefined') {
            console.error("CRITICAL ERROR: config.js is not loaded or is missing variables. Make sure it is included in index.html before app.js.");
            loginMessage.textContent = "Configuration Error: Cannot connect to backend.";
            loginMessage.style.color = '#ef4444';
        } else {
            loginMessage.textContent = `Critical Error: ${err.message}`;
            loginMessage.style.color = '#ef4444';
            console.error("A critical error occurred on startup:", err);
        }
    }
});