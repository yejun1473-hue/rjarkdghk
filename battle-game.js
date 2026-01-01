// Game state
let gameState = {
    player1: {
        id: '',
        name: '플레이어',
        level: 1,
        hp: 100,
        maxHp: 100,
        attack: 10,
        defense: 5,
        speed: 8,
        isAI: false,
        isTurn: true
    },
    player2: {
        id: 'ai',
        name: 'AI 상대',
        level: 1,
        hp: 100,
        maxHp: 100,
        attack: 8,
        defense: 5,
        speed: 6,
        isAI: true,
        isTurn: false
    },
    isAIBattle: false,
    battleLog: [],
    isGameOver: false
};

// DOM Elements
const elements = {
    player1Name: document.getElementById('player1-name'),
    player1Level: document.getElementById('player1-level'),
    player1Hp: document.getElementById('player1-hp'),
    player1HpBar: document.getElementById('player1-hp-bar'),
    player1Attack: document.getElementById('player1-attack'),
    
    player2Name: document.getElementById('player2-name'),
    player2Level: document.getElementById('player2-level'),
    player2Hp: document.getElementById('player2-hp'),
    player2HpBar: document.getElementById('player2-hp-bar'),
    player2Attack: document.getElementById('player2-attack'),
    
    turnIndicator: document.getElementById('turn-indicator'),
    battleLog: document.getElementById('battle-log'),
    
    attackBtn: document.getElementById('attack-btn'),
    skillBtn: document.getElementById('skill-btn'),
    runBtn: document.getElementById('run-btn'),
    
    victoryScreen: document.getElementById('victory-screen'),
    victoryTitle: document.getElementById('victory-title'),
    victoryMessage: document.getElementById('victory-message'),
    rewardMessage: document.getElementById('reward-message')
};

// Initialize the game
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Supabase
        window.supabase = supabase.createClient(
            'https://utfrjzcnefsbuadnkdud.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZnJqemNuZWZzYnVhZG5rZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MjE1MTYsImV4cCI6MjA4MjM5NzUxNn0.D3Za1nMw-x0JwOpkFuYceUHlagcpRdrpFqNUIP5Kjdc'
        );

        // Check if user is authenticated
        const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
        if (sessionError || !session) {
            window.location.href = 'login.html';
            return;
        }

        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const battleId = urlParams.get('battleId');
        const isAI = urlParams.get('ai') === 'true';
        
        // Initialize game based on battle type
        if (isAI) {
            initAIBattle(urlParams);
        } else if (battleId) {
            initPvPBattle(battleId, session.user.id);
        } else {
            throw new Error('잘못된 배틀 접근입니다.');
        }

        // Set up event listeners
        setupEventListeners();
        
        // Start the game
        updateUI();
        addToBattleLog('배틀이 시작되었습니다!');
        
        // If it's AI's turn, make AI move
        if (gameState.isAIBattle && !gameState.player1.isTurn) {
            setTimeout(aiTurn, 1500);
        }
        
    } catch (error) {
        console.error('게임 초기화 중 오류 발생:', error);
        alert('게임을 시작하는 중 오류가 발생했습니다: ' + error.message);
        window.location.href = 'index.html';
    }
});

// Initialize AI Battle
function initAIBattle(urlParams) {
    gameState.isAIBattle = true;
    
    // Set player info
    gameState.player1.id = 'player';
    gameState.player1.name = '나';
    
    // Set AI opponent info from URL params or use defaults
    if (urlParams.get('enemyName')) {
        gameState.player2.name = decodeURIComponent(urlParams.get('enemyName'));
    }
    
    if (urlParams.get('stats')) {
        try {
            const stats = JSON.parse(urlParams.get('stats'));
            Object.assign(gameState.player2, stats);
            gameState.player2.maxHp = gameState.player2.hp; // Set max HP to initial HP
        } catch (e) {
            console.error('Invalid stats format, using defaults', e);
        }
    }
    
    // Set initial turn to player
    gameState.player1.isTurn = true;
    gameState.player2.isTurn = false;
}

// Initialize PvP Battle
async function initPvPBattle(battleId, userId) {
    try {
        // Fetch battle data from Supabase
        const { data: battle, error } = await supabase
            .from('battles')
            .select('*')
            .eq('id', battleId)
            .single();
            
        if (error) throw error;
        if (!battle) throw new Error('배틀 정보를 찾을 수 없습니다.');
        
        // Determine if current user is player1 or player2
        const isPlayer1 = battle.player1_id === userId;
        
        // Set player and opponent data
        if (isPlayer1) {
            gameState.player1.id = battle.player1_id;
            gameState.player1.name = battle.player1_nickname || '플레이어 1';
            gameState.player2.id = battle.player2_id;
            gameState.player2.name = battle.player2_nickname || '플레이어 2';
            gameState.player1.isTurn = battle.current_turn === 'player1';
            gameState.player2.isTurn = !gameState.player1.isTurn;
        } else {
            gameState.player1.id = battle.player2_id;
            gameState.player1.name = battle.player2_nickname || '플레이어 2';
            gameState.player2.id = battle.player1_id;
            gameState.player2.name = battle.player1_nickname || '플레이어 1';
            gameState.player1.isTurn = battle.current_turn === 'player2';
            gameState.player2.isTurn = !gameState.player1.isTurn;
        }
        
        // Set battle ID for updates
        gameState.battleId = battleId;
        
        // Set up realtime updates for PvP
        setupRealtimeUpdates(battleId, userId);
        
    } catch (error) {
        console.error('PvP 배틀 초기화 오류:', error);
        throw error;
    }
}

// Set up event listeners
function setupEventListeners() {
    // Attack button
    elements.attackBtn.addEventListener('click', () => {
        if (gameState.isGameOver || !gameState.player1.isTurn) return;
        
        // Calculate damage
        const damage = Math.max(1, gameState.player1.attack - Math.floor(Math.random() * gameState.player2.defense));
        
        // Apply damage
        gameState.player2.hp = Math.max(0, gameState.player2.hp - damage);
        
        // Add to battle log
        addToBattleLog(`💥 ${gameState.player1.name}의 공격! ${gameState.player2.name}에게 ${damage}의 데미지를 입혔습니다!`);
        
        // Check if battle is over
        if (gameState.player2.hp <= 0) {
            endBattle(true);
            return;
        }
        
        // Switch turns
        if (gameState.isAIBattle) {
            // In AI battle, switch to AI turn
            gameState.player1.isTurn = false;
            gameState.player2.isTurn = true;
            updateUI();
            
            // AI makes a move after a short delay
            setTimeout(aiTurn, 1500);
        } else {
            // In PvP, update turn in database
            updateTurnInDatabase();
        }
    });
    
    // Skill button (disabled for now)
    elements.skillBtn.addEventListener('click', () => {
        // Skill implementation can be added here
    });
    
    // Run button
    elements.runBtn.addEventListener('click', () => {
        if (confirm('정말로 도망가시겠습니까? 패배로 처리됩니다.')) {
            endBattle(false);
        }
    });
}

// AI turn logic
function aiTurn() {
    if (gameState.isGameOver) return;
    
    // Simple AI: 80% chance to attack, 20% chance to do nothing (simulate thinking)
    if (Math.random() < 0.8) {
        // Calculate damage
        const damage = Math.max(1, gameState.player2.attack - Math.floor(Math.random() * gameState.player1.defense));
        
        // Apply damage
        gameState.player1.hp = Math.max(0, gameState.player1.hp - damage);
        
        // Add to battle log
        addToBattleLog(`💥 ${gameState.player2.name}의 공격! ${gameState.player1.name}은(는) ${damage}의 데미지를 입었습니다!`);
        
        // Update UI
        updateUI();
        
        // Check if battle is over
        if (gameState.player1.hp <= 0) {
            endBattle(false);
            return;
        }
    } else {
        addToBattleLog(`🤔 ${gameState.player2.name}이(가) 망설이고 있습니다...`);
    }
    
    // Switch back to player's turn
    gameState.player1.isTurn = true;
    gameState.player2.isTurn = false;
    updateUI();
}

// Update turn in database (for PvP)
async function updateTurnInDatabase() {
    if (!gameState.battleId) return;
    
    try {
        const newTurn = gameState.player1.isTurn ? 'player2' : 'player1';
        
        await supabase
            .from('battles')
            .update({
                current_turn: newTurn,
                updated_at: new Date().toISOString()
            })
            .eq('id', gameState.battleId);
            
    } catch (error) {
        console.error('턴 업데이트 오류:', error);
    }
}

// Set up realtime updates for PvP
function setupRealtimeUpdates(battleId, userId) {
    // Implementation for realtime PvP updates
    // This would involve subscribing to database changes
    // and updating the game state accordingly
}

// Update UI based on game state
function updateUI() {
    // Update player 1 UI
    elements.player1Name.textContent = gameState.player1.name;
    elements.player1Level.textContent = gameState.player1.level;
    elements.player1Hp.textContent = `${Math.max(0, gameState.player1.hp)} / ${gameState.player1.maxHp}`;
    elements.player1HpBar.style.width = `${(gameState.player1.hp / gameState.player1.maxHp) * 100}%`;
    elements.player1Attack.textContent = gameState.player1.attack;
    
    // Update player 2 UI
    elements.player2Name.textContent = gameState.player2.name;
    elements.player2Level.textContent = gameState.player2.level;
    elements.player2Hp.textContent = `${Math.max(0, gameState.player2.hp)} / ${gameState.player2.maxHp}`;
    elements.player2HpBar.style.width = `${(gameState.player2.hp / gameState.player2.maxHp) * 100}%`;
    elements.player2Attack.textContent = gameState.player2.attack;
    
    // Update turn indicator
    if (gameState.player1.isTurn) {
        elements.turnIndicator.textContent = `당신의 턴입니다!`;
    } else if (gameState.isAIBattle) {
        elements.turnIndicator.textContent = `${gameState.player2.name}의 턴...`;
    } else {
        elements.turnIndicator.textContent = `${gameState.player2.name}의 턴을 기다리는 중...`;
    }
    
    // Update button states
    elements.attackBtn.disabled = !gameState.player1.isTurn || gameState.isGameOver;
    elements.skillBtn.disabled = true; // Disabled for now
    elements.runBtn.disabled = gameState.isGameOver;
    
    // Update HP bar colors
    updateHpBarColor('player1');
    updateHpBarColor('player2');
}

// Update HP bar color based on HP percentage
function updateHpBarColor(player) {
    const bar = player === 'player1' ? elements.player1HpBar : elements.player2HpBar;
    const hp = gameState[player].hp;
    const maxHp = gameState[player].maxHp;
    const percent = (hp / maxHp) * 100;
    
    if (percent > 60) {
        bar.style.backgroundColor = '#48bb78'; // Green
    } else if (percent > 30) {
        bar.style.backgroundColor = '#ecc94b'; // Yellow
    } else {
        bar.style.backgroundColor = '#e53e3e'; // Red
    }
}

// Add message to battle log
function addToBattleLog(message) {
    const logEntry = document.createElement('p');
    logEntry.textContent = message;
    elements.battleLog.insertBefore(logEntry, elements.battleLog.firstChild);
    
    // Keep only the last 50 log entries
    while (elements.battleLog.children.length > 50) {
        elements.battleLog.removeChild(elements.battleLog.lastChild);
    }
    
    // Auto-scroll to top
    elements.battleLog.scrollTop = 0;
}

// End the battle
function endBattle(isVictory) {
    gameState.isGameOver = true;
    
    // Update UI
    elements.victoryScreen.classList.remove('hidden');
    
    if (isVictory) {
        elements.victoryTitle.textContent = '🎉 승리! 🎉';
        elements.victoryMessage.textContent = `${gameState.player2.name}을(를) 물리쳤습니다!`;
        
        // Calculate rewards
        const goldReward = Math.floor(Math.random() * 50) + 50;
        const expReward = Math.floor(Math.random() * 30) + 20;
        
        elements.rewardMessage.textContent = `보상: 골드 +${goldReward}, 경험치 +${expReward}`;
        
        // Save rewards to database if this is not a PvP battle
        if (gameState.isAIBattle) {
            saveRewards(goldReward, expReward);
        }
    } else {
        elements.victoryTitle.textContent = '😢 패배...';
        elements.victoryMessage.textContent = '다음엔 꼭 이기자구요!';
        elements.rewardMessage.textContent = '조금 더 강해져서 다시 도전하세요!';
    }
    
    // Disable all buttons
    elements.attackBtn.disabled = true;
    elements.skillBtn.disabled = true;
    elements.runBtn.disabled = true;
    
    // In PvP, update battle status in database
    if (!gameState.isAIBattle && gameState.battleId) {
        updateBattleResult(isVictory);
    }
}

// Save rewards to database
async function saveRewards(gold, exp) {
    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        
        // Get current user data
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('gold, exp, level')
            .eq('id', user.id)
            .single();
            
        if (profileError) throw profileError;
        
        // Calculate new values
        let newGold = (profile.gold || 0) + gold;
        let newExp = (profile.exp || 0) + exp;
        let newLevel = profile.level || 1;
        
        // Level up if enough exp
        const expNeeded = newLevel * 100;
        if (newExp >= expNeeded && newLevel < 100) {
            newExp -= expNeeded;
            newLevel++;
            
            // Show level up message
            addToBattleLog(`🎉 레벨 업! ${newLevel}레벨이 되었습니다!`);
        }
        
        // Update profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                gold: newGold,
                exp: newExp,
                level: newLevel,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
            
        if (updateError) throw updateError;
        
    } catch (error) {
        console.error('보상 저장 오류:', error);
    }
}

// Update battle result in database (for PvP)
async function updateBattleResult(isVictory) {
    try {
        await supabase
            .from('battles')
            .update({
                status: 'completed',
                winner_id: isVictory ? gameState.player1.id : gameState.player2.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', gameState.battleId);
            
    } catch (error) {
        console.error('배틀 결과 업데이트 오류:', error);
    }
}
