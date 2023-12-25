const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const tasks = require('./tasks.json');
const { type } = require('os');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;
app.use(express.json());

const rooms = {}
const players = {}

class Room {
    constructor(socket) {
        this.players = {};
        this.id = socket.id;
        this.addPlayer(socket);
        this.tasks = [...tasks];
        this.killer = null;
        this.task = null;
        this.objectSkip = false;
        this.nextRoundCount = 0;
        this.state = -1;
        this.skipped = false;
    }

    addPlayer(socket) {
        socket.join(this.id);
        this.players[socket.id] = {
            ready: false,
            name: `player${Object.keys(this.players).length + 1}`,
            vote: null,
            points: 0,
            success: null
        };
        players[socket.id].room = this.id;
    }

    ready(id) {
        this.players[id].ready = true;
        if (Object.values(this.players).filter(p => p.ready).length < Object.keys(this.players).length) return;
        if (Object.keys(this.players).length < 3) return;
        Object.keys(this.players).forEach(id => {
            players[id].emit('init', {players: this.players, me: id})
        })
        this.start();
    }

    start() {
        let ids = Object.keys(this.players);
        this.killer = ids[Math.floor(Math.random() * ids.length)];
        this.task = this.tasks.splice(Math.floor(Math.random() * this.tasks.length), 1)[0]
        if (typeof this.task === 'string' && this.task.includes('$PLAYER')) {
            let randName = Object.values(this.players)[Math.floor(Math.random() * Object.keys(this.players).length)].name;
            this.task = this.task.replace('$PLAYER', randName);
        }
        this.toDetectives('detect')
        players[this.killer].emit('task', this.task);
        this.state = 1;
    }

    skip() {
        if (this.tasks.length < 2) {
            this.tasks.push(tasks)
        }
        this.task = this.tasks.splice(Math.floor(Math.random() * this.tasks.length), 1)[0]
        if (typeof this.task === 'object') {
            let newTask = this.tasks.splice(Math.floor(Math.random() * this.tasks.length), 1)[0]
            this.tasks.push(this.task)
            this.task = newTask;
        }
        if (typeof this.task === 'string' && this.task.includes('$PLAYER')) {
            let randName = Object.values(this.players)[Math.floor(Math.random() * Object.keys(this.players).length)].name;
            this.task = this.task.replace('$PLAYER', randName);
        }
        players[this.killer].emit('newTask', this.task);
        this.skipped = true;
    }

    toDetectives(emission, data = null) {
        Object.keys(this.players).forEach(id => {
            if (id === this.killer) return;
            if (data) data.me = id;
            if (data) {
                players[id].emit(emission, data)
            } else {
                players[id].emit(emission)
            }
        })
    }

    vote(votee, voter) {
        this.players[voter].vote = votee;
        let voted = Object.keys(this.players).filter(id => this.players[id].vote !== null).length;
        if (voted >= Object.keys(this.players).length - 1) {
            this.toDetectives('voteFinished')
            players[this.killer].emit('readyToReveal')
            this.state = 2;
        }
    }

    reveal() {
        let task;
        if (typeof this.task === 'object' && this.objectSkip) {
            task = Object.values(this.task)[0]
        } else if (typeof this.task === 'object') {
            task = Object.keys(this.task)[0]
        } else {
            task = this.task;
        }
        this.toDetectives('reveal', {killer: this.players[this.killer], task: task})
        this.state = 3;
    }

    successVote(voter, vote) {
        this.players[voter].success = vote;
        let voted = Object.keys(this.players).filter(id => this.players[id].success !== null).length;
        if (voted >= Object.keys(this.players).length - 1) {
            this.divvyPoints()
        }
    }

    divvyPoints() {
        console.log(Object.keys(this.players).filter(id => this.players[id].success).length)
        if (Object.keys(this.players).filter(id => this.players[id].success).length / (Object.keys(this.players).length - 1) >= 0.5) {
            this.players[this.killer].points += Object.keys(this.players).length;
        }
        Object.keys(this.players).forEach(id => {
            if (this.players[id] === this.killer) return;
            if (this.players[id].vote === this.killer) {
                this.players[id].points++;
                this.players[this.killer].points--
            }
        })
        io.to(this.id).emit('points', this.players)
        this.state = 4;
    }

    nextRound() {
        this.nextRoundCount++;
        if (this.nextRoundCount >= Object.keys(this.players).length) {
            this.nextRoundCount = 0;
            this.objectSkip = false;
            this.skipped = false;
            Object.keys(this.players).forEach(id => {
                players[id].vote = null;
                players[id].success = null;
            })
            this.start();
        }
    }

    recoverState(id) {
        players[id].emit('recover', {players: this.players, me: id, state: this.state, killer: (id === this.killer), task: this.task, skipped: this.skipped})
    }
}

io.on('connection', socket => {
    let recover = false;
    console.log(socket.handshake)
    console.log(socket.handshake.headers.cookie)
    Object.keys(players).forEach(id => {
        if (players[id].handshake.headers.cookie === socket.handshake.headers.cookie) {
            let newPlayer = {...rooms[players[id].room].players[id]}
            delete rooms[players[id].room].players[id];
            rooms[players[id].room].players[id] = newPlayer;
            
            let room = players[id].room;
            delete players[id]
            socket.join(room);
            socket.id = id;
            players[id] = socket;
            players[id].room = room;
            rooms[players[id].room].recoverState(id)
            recover = true;
        }
    })

    if (!recover) {
        players[socket.id] = socket;
        
        if (Object.keys(rooms).length > 0) {
            rooms[Object.keys(rooms)[0]].addPlayer(socket)
        } else {
            rooms[socket.id] = new Room(socket)
        }
    }    

    socket.on('joinGame', name => {
        rooms[players[socket.id].room].players[socket.id].name = name;
        rooms[players[socket.id].room].state = 0;
    })

    socket.on('readyUp', () => {
        console.log('hey')
        rooms[players[socket.id].room].ready(socket.id)
    })

    socket.on('vote', id => {
        rooms[players[socket.id].room].vote(id, socket.id)
    })

    socket.on('reveal', () => {
        console.log('gotmessage')
        rooms[players[socket.id].room].reveal();
    })

    socket.on('skip', () => {
        if (typeof this.task === 'object') {
            rooms[players[socket.id].room].objectSkip = true;    
            return
        }
        rooms[players[socket.id].room].skip();
    })

    socket.on('successVote', vote => {
        rooms[players[socket.id].room].successVote(socket.id, vote);
    })

    socket.on('nextRound', () => {
        rooms[players[socket.id].room].nextRound()
    })
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'socket.io-client', 'dist', 'socket.io.js'));
});

app.get('/index.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.js'));
});

app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

server.listen(PORT, () => {
    console.log(`server is listen on ${PORT}`);
});