// app.js

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
    const btnLogout = document.getElementById('btn-logout');
    const userInfo = document.getElementById('user-info');
    const userPic = document.getElementById('user-pic');
    const userName = document.getElementById('user-name');
    const chatWindow = document.getElementById('chat-window');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const btnTheme = document.getElementById('btn-theme');

    // --- 3. APP STATE ---
    let currentUser = null;
    let messagesHistory = [];
    let messageSubscription = null;

    // --- 4. AUTHENTICATION ---
    const signInWithGoogle = async () => {
        await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    };
    const signOut = async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    };
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        currentUser = session?.user || null;
        await updateUI();
    });

    // --- 5. UI MANAGEMENT ---
    const updateUI = async () => {
        if (currentUser) {
            appContainer.classList.remove('hidden');
            loginOverlay.classList.add('hidden');
            btnLogout.classList.remove('hidden');
            userInfo.classList.remove('hidden');
            userPic.src = currentUser.user_metadata.avatar_url;
            userName.textContent = currentUser.user_metadata.full_name;
            messageInput.disabled = false;
            sendButton.disabled = messageInput.value.trim() === '';
            await fetchMessages();
            subscribeToMessages();
        } else {
            appContainer.classList.add('hidden');
            loginOverlay.classList.remove('hidden');
            messageInput.disabled = true;
            sendButton.disabled = true;
            if (messageSubscription) {
                messageSubscription.unsubscribe();
            }
        }
    };

    // --- 6. CHAT & AI LOGIC ---
    const renderMessage = (message) => {
        if (!message || !message.text) return;
        const senderClass = currentUser && message.sender_id === currentUser.id ? 'user' : 'bot';
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

    const fetchMessages = async () => {
        const { data, error } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true });
        if (error) return console.error('Error fetching messages:', error);
        chatWindow.innerHTML = '';
        data.forEach(renderMessage);
        messagesHistory = data.map(msg => ({
            role: (currentUser && msg.sender_id === currentUser.id) ? 'user' : 'assistant',
            content: msg.text
        }));
    };

    const sendMessage = async () => {
        const text = messageInput.value.trim();
        if (text.length === 0 || !currentUser) return;

        const userMessage = { text, sender_id: currentUser.id };
        messageInput.value = '';
        sendButton.disabled = true;
        
        // Save user message. The subscription will render it.
        await supabaseClient.from('messages').insert([userMessage]);
        messagesHistory.push({ role: 'user', content: text });

        // Call the AI function
        try {
            const lastMessages = messagesHistory.slice(-6);
            const { data, error } = await supabaseClient.functions.invoke('get-ai-response', {
                body: { messages: lastMessages },
            });
            if (error) throw error;
            
            // The edge function should save the bot's reply.
            // Our real-time subscription will pick it up and render it automatically.

        } catch (error) {
            console.error('Error calling Edge Function:', error);
            // **THIS IS THE UPDATED PART**
            // If the AI fails, we save an error message to the DB so the user sees it.
            const errorMessage = { text: "Sorry, the AI assistant is not available right now.", sender_id: 'bot' };
            await supabaseClient.from('messages').insert([errorMessage]);
        }
    };

    const subscribeToMessages = () => {
        if (messageSubscription) {
             messageSubscription.unsubscribe();
        }
        messageSubscription = supabaseClient.channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
                renderMessage(payload.new);
            })
            .subscribe();
    };
    
    // --- 7. EVENT LISTENERS ---
    btnGoogleLogin.addEventListener('click', signInWithGoogle);
    btnLogout.addEventListener('click', signOut);
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
        if (theme === 'light') {
            document.body.classList.add('light');
            btnTheme.textContent = 'Light';
        } else {
            document.body.classList.remove('light');
            btnTheme.textContent = 'Dark';
        }
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
