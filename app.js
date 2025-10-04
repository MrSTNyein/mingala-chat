// app.js v2.0
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SUPABASE SETUP ---
    const supabaseUrl = 'https://tzetdtcpxsqqwccymsol.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6ZXRkdGNweHNxcXdjY3ltc29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1Nzg5NDgsImV4cCI6MjA3NTE1NDk0OH0.uJkvrf5z76nqunfZR5sx0P3WdVAIgbqb_c-ByxMelCc';
    const { createClient } = supabase;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

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

    // --- 4. AUTHENTICATION ---
    const signInWithGoogle = async () => { await supabaseClient.auth.signInWithOAuth({ provider: 'google' }); };
    const signInAsGuest = async () => { await supabaseClient.auth.signInAnonymously(); };
    const signOut = async () => { await supabaseClient.auth.signOut(); window.location.reload(); };

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        currentUser = session?.user || null;
        await updateUI();
    });

    // --- 5. UI MANAGEMENT & DATA FETCHING ---
    const updateUI = async () => {
        if (currentUser) {
            appContainer.classList.remove('hidden');
            loginOverlay.classList.add('hidden');
            btnLogout.classList.remove('hidden');
            userInfo.classList.remove('hidden');
            messageInput.disabled = false;
            
            if (currentUser.is_anonymous) {
                userPic.style.display = 'none';
                userName.textContent = 'Guest User';
            } else {
                userPic.style.display = 'block';
                userPic.src = currentUser.user_metadata.avatar_url;
                userName.textContent = currentUser.user_metadata.full_name;
            }
            await loadChatSessions();
            startNewChat(); // Start with a blank slate
        } else {
            appContainer.classList.add('hidden');
            loginOverlay.classList.remove('hidden');
        }
    };

    const loadChatSessions = async () => {
        const { data, error } = await supabaseClient.from('chats').select('*').order('created_at', { ascending: false });
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

    // --- 6. CORE CHAT LOGIC ---
    const startNewChat = () => {
        currentChatId = null;
        if (messageSubscription) messageSubscription.unsubscribe();
        chatWindow.innerHTML = '';
        chatWindow.appendChild(chatStarter);
        chatStarter.classList.remove('hidden');
        document.querySelectorAll('.chat-list-item.active').forEach(el => el.classList.remove('active'));
        messageInput.value = '';
        messageInput.focus();
    };

    const loadChat = async (chatId) => {
        if (currentChatId === chatId) return;
        currentChatId = chatId;

        chatStarter.classList.add('hidden');
        chatWindow.innerHTML = '<div class="loading">Loading chat...</div>';

        const { data, error } = await supabaseClient.from('messages').select('*').eq('chat_id', chatId).order('created_at');
        if (error) { console.error("Error loading messages:", error); return; }

        chatWindow.innerHTML = ''; // Clear loading message
        data.forEach(renderMessage);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        // Highlight active chat in sidebar
        document.querySelectorAll('.chat-list-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === chatId);
        });
        
        subscribeToMessages(chatId);
    };

    const sendMessage = async () => {
        const text = messageInput.value.trim();
        if (text.length === 0 || !currentUser) return;

        chatStarter.classList.add('hidden');
        
        // Optimistic rendering for instant feedback
        const userMessage = { text, sender_id: currentUser.id };
        renderMessage(userMessage);
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendButton.disabled = true;

        let chatId = currentChatId;
        
        // If this is the first message of a new chat, create the chat first
        if (!chatId) {
            const { data, error } = await supabaseClient.from('chats').insert({ title: text.substring(0, 40) }).select().single();
            if (error) { console.error("Error creating chat:", error); return; }
            chatId = data.id;
            currentChatId = chatId; // Set the current chat ID
            await loadChatSessions(); // Refresh sidebar
            document.querySelector(`.chat-list-item[data-id="${chatId}"]`)?.classList.add('active');
            subscribeToMessages(chatId); // Subscribe to the new chat
        }

        // Save the message to the database
        const { error } = await supabaseClient.from('messages').insert({ chat_id: chatId, text, sender_id: currentUser.id });
        if (error) console.error("Error saving message:", error);

        // Call the AI function
        // try { ... } catch { ... } logic will go here
    };

    const renderMessage = (message) => {
        const senderClass = (currentUser && message.sender_id === currentUser.id) || (currentUser.is_anonymous && message.sender_id === currentUser.id) ? 'user' : 'bot';
        const messageRow = document.createElement('div');
        messageRow.className = `chat-row ${senderClass}`;
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.innerHTML = marked.parse(message.text);
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

    // --- 7. EVENT LISTENERS ---
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
    
    // --- 8. THEME SWITCHER ---
    const applyTheme = (theme) => {
        document.body.classList.toggle('light', theme === 'light');
        btnTheme.textContent = theme === 'light' ? 'Light' : 'Dark';
    };
    btnTheme.addEventListener('click', () => {
        const newTheme = document.body.classList.contains('light') ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    // --- 9. INITIALIZATION ---
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    updateUI();
});
