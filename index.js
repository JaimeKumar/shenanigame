const socket = io();
var votedPlayer = null;
var task = null;
var success = null;

socket.on('init', data => {
    initPlayers(data.players, data.me)
})

socket.on('task', taskEmmision => {
    giveTask(taskEmmision, false)
})

socket.on('detect', () => {
    setDetective();
})

socket.on('readyToReveal', () => {
    killerToReveal()
})

socket.on('voteFinished', () => {
    setTask("Everyone has voted. The perpetrator can now reveal themselves!")
})

socket.on('reveal', info => {
    setTask(`The perpetrator was ${info.killer.name}.\nTheir task was ${info.task}.\nDid they pull it off?`)
    show(["successVote", "confirmSuccess"])
})

socket.on('newTask', task => {
    setTask(task)
})

socket.on('points', players => {
    scoreboard(players)
})

socket.on('recover', data => {
    console.log(data.state)
    hide(["joinForm", "joinGame"])
    initPlayers(data.players, data.me)
    switch (data.state) {
        case -1:
            show(["joinForm", "joinGame"])
            break;
        case 0:
            show(["readyButton"])
            break;
        case 1:
            if (data.killer) {
                giveTask(data.task, data.skipped)
            } else {
                setDetective()
            }
            show(["task"])
            break;
        case 2:
            if (data.killer) {
                killerToReveal()
            } else {
                setTask("Everyone has voted. The perpetrator can now reveal themselves!")
            }
            show(["task"])
            break;
        case 3:
            if (data.killer) {
                setTask("Now prove to everyone that you completed your task.")
            } else {
                setTask(`The perpetrator was ${data.players[data.killer].name}. Their task was ${data.task}. Did they pull it off?`)
                show(["successVote", "confirmSuccess"])
            }
            show(["task"])
            break;
        case 4:
            scoreboard(data.players);
            break;
    }
})

function joinGame() {
    let name = document.getElementById('joinName').value;
    socket.emit('joinGame', name)
    hide(["joinForm", "joinGame"])
    show(["readyButton"])
}

function show(elements) {
    elements.forEach(id => {
        document.getElementById(id).classList.remove('hidden')
    })
}

function hide(elements) {
    elements.forEach(id => {
        document.getElementById(id).classList.add('hidden')
    })
}

function giveTask(taskEmmision, skipped) {
    document.getElementById('readyButton').classList.add('hidden')
    task = taskEmmision;
    if (typeof task === 'object') {
        document.getElementById('task').innerHTML = Object.keys(task)[0];
    } else {
        document.getElementById('task').innerHTML = task;
    }

    show(["task"])
    if (!skipped) show(["skipButton"])
}

function setDetective() {
    document.getElementById('readyButton').classList.add('hidden')
    setTask("Someone among you is going to do something strange. Stay vigilant, and click vote when you think you know who it is.")
    show(["voteButton", "task"])
}

function killerToReveal() {
    setTask("Everyone has voted. Click Reveal when you're ready.")
    show(["revealButton"])
    hide(["skipButton"])
}

function setTask(txt) {
    document.getElementById('task').innerHTML = txt;
}

function initPlayers(players, me) {
    Object.keys(players).forEach(id => {
        console.log(me, id)
        if (me === id) return;
        document.getElementById('voteButtons').innerHTML += `<div id="vote${id}" class="button" onclick="playerClick('${id}')">${players[id].name}</div>`
    })

    Object.keys(players).forEach((id, i) => {
        document.getElementById('points').innerHTML += `
            <div class="pointsPlayer" id="scoreboard${id}" style="top: ${(i+1.5) * 30}px;">
                <p>${players[id].name}</p>
                <p id="points${id}">${players[id].points}</p>
            </div>
        `
    })
}

function readyUp() {
    socket.emit('readyUp')
    document.getElementById('readyButton').classList.add('greyed')
    document.getElementById('readyButton').disabled = true;
}

function vote() {
    hide(["voteButton", "task"])
    show(["voteButtons", "confirmVote"])
}

function playerClick(id) {
    document.getElementById('confirmVote').classList.remove('greyed')
    if (votedPlayer !== id && votedPlayer) {
        document.getElementById(`vote${votedPlayer}`).classList.remove('selected')
    }
    votedPlayer = id;
    document.getElementById(`vote${id}`).classList.add('selected')
}

function submitVote() {
    if (votedPlayer === null) return;
    socket.emit('vote', votedPlayer)
    hide(["voteButtons", "confirmVote"])
    document.getElementById(`vote${votedPlayer}`).classList.remove('selected')
    setTask("You have voted.\n Waiting for the rest of the votes.")
    document.getElementById('task').classList.remove('hidden')
}

function reveal() {
    socket.emit('reveal')
    setTask("Now prove to everyone that you completed your task.")
    document.getElementById('revealButton').classList.add('hidden')
}

function skipTask() {
    hide(["skipButton"])
    if (typeof task === 'object') {
        document.getElementById('task').innerHTML = Object.values(task)[0]
    }
    socket.emit('skip')
}

function successVote(which) {
    document.getElementById('confirmSuccess').classList.remove('greyed')
    if (success !== which && success !== null) {
        document.getElementById(`${success}Success`).classList.remove('selected')
    }
    success = which;
    document.getElementById(`${which}Success`).classList.add('selected')
}

function submitSuccess() {
    if (success === null) return;
    socket.emit('successVote', success);
    hide(["successVote", "confirmSuccess"])
    document.getElementById(`${success}Success`).classList.remove('selected')
}

function scoreboard(players) {
    hide(["task"])
    show(["points"])

    const sortedPlayersArray = Object.entries(players)
        .map(([id, { points }]) => ({ id, points }))
        .sort((a, b) => b.points - a.points);

    setTimeout(() => {
        sortedPlayersArray.forEach((player, i) => {
            document.getElementById(`scoreboard${player.id}`).style.top = ((i+1.5) * 30) + 'px';
            document.getElementById(`points${player.id}`).innerHTML = player.points;
        })
        setTimeout(() => {
            nextRound();
        }, 3000)
    }, 2000)
}

function nextRound() {
    socket.emit('nextRound')
    hide(["points", "continuePoints"])
    document.getElementById('task').innerHTML = "Waiting for other players."
    show(["task"])
}