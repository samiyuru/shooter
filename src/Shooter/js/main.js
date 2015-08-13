/**
 * Created by samiyuru
 */

$(window).load(function () {

    var bgElem = $('#game-view');

    var Util = {
        invertX: function (x) {
            return $(window).width() - x;
        }
    };

    var thisPlayer = null;
    var opposites = [];
    var mates = [];
    var craftsMap = {};

    function isMate(member) {
        return thisPlayer && (thisPlayer.team == member.team);
    }

    function makeCraft(member) {
        if (member.team == thisPlayer.team) {//in our team
            var player = new PlayerFlight(bgElem, member.name);
            player.id = member.id;
            player.team = member.team;
            player.setOpposites(opposites);
            mates.push(player);
            craftsMap[member.id] = player;
        } else {//opposite team
            var opposite = new OppositeFlight(bgElem, member.name);
            opposite.setOpposites(mates);
            opposite.id = member.id;
            opposite.team = member.team;
            opposite.setPos(Util.invertX(member.x), member.y);
            opposites.push(opposite);
            craftsMap[member.id] = opposite;
        }
    }

    function removeCraft(craft) {
        if (thisPlayer.id == craft.id) {
            var index = mates.indexOf(craft);
            if (index > -1) {
                mates.splice(index, 1);
            }
        } else {
            var index = opposites.indexOf(craft);
            if (index > -1) {
                opposites.splice(index, 1);
            }
        }
        var craft = craftsMap[craft.id];
        delete craftsMap[craft.id];
        craft.remove();
    }

    var playerName = $.cookie('playerName');
    if (playerName == null) {
        var playerName = prompt('Please enter your name', '');
        if(playerName == null){
            playerName = 'Fighter';
        }
        $.cookie('playerName', playerName);
    }

    var connector = new Connector();

    connector.connect(playerName, function (data) {
        thisPlayer = new PlayerFlight(bgElem, playerName);
        thisPlayer.id = data.uid;
        thisPlayer.team = data.team;
        thisPlayer.setOpposites(opposites);
        thisPlayer.listner = {
            moved: function (x, y) {
                connector.send({
                    type: 'move',
                    id: thisPlayer.id,
                    x: x,
                    y: y
                });
            },
            fired: function () {
                connector.send({
                    type: 'fire',
                    id: thisPlayer.id
                });
            },
            exploded: function (id) {
                connector.send({
                    type: 'explode',
                    senderId: thisPlayer.id,
                    explodeeId: id
                });
            }
        };
        thisPlayer.makeControllable();
        mates.push(thisPlayer);
        craftsMap[data.uid] = thisPlayer;
        var members = data.members;
        for (var i in members) {
            var member = members[i];
            makeCraft(member);
        }
    });

    connector.onFire = function (data) {
        var craft = craftsMap[data.id];
        if (craft) {
            craft.fire();
        }
    };

    connector.onMove = function (data) {
        var craft = craftsMap[data.id];
        if (craft) {
            craft.setPos((isMate(craft)) ? data.x : Util.invertX(data.x), data.y);
        }
    };

    connector.onExplode = function (data) {
        var shooter = craftsMap[data.shooter];
        shooter.incScore();
        var craft = craftsMap[data.id];
        if (craft) {
            craft.explode();
            removeCraft(craft)
        }
    };

    connector.onMember = function (data) {
        makeCraft(data);
    };

    connector.onUnmember = function (data) {
        var craft = craftsMap[data.id];
        if (craft) {
            removeCraft(craft);
            craft.remove();
        }
    };

    $(window).on('beforeunload', function () {
        connector.close();
    });
});

function BaseFlight() {

}

function PlayerFlight(bgElem, name) {

    this.id = '';
    this.team = '';
    this.name = '';

    var score = 0;

    this.listner = null;

    var flightElem = $('<div>', {
        id: 'player-craft',
        'class': 'spacecraft'
    });
    flightElem.append($('<img>', {
        'src': 'images/rfaceCraft.png',
        'class': 'craft-img'
    }));
    var detailCont = $('<div>', {
        'class': 'craft-name'
    });
    flightElem.append(detailCont);
    detailCont.append($('<span>', {
        text: name + ' : '
    }));
    var scoreElem = $('<span>', {
        text: score
    });
    detailCont.append(scoreElem);
    bgElem.append(flightElem);

    var opposites = [];
    var isExploded = false;
    var onExplode = null;

    var craftSize = {
        w: $(window).width() / 7,
        h: 0
    };
    craftSize.h = craftSize.w * 177 / 671;

    flightElem.css({
        width: craftSize.w,
        height: craftSize.h
    });

    var craftPos = {
        x: 0,
        y: 0
    };

    var lastFired = 0;
    var GUN_LOAD_TIME = 500;

    var self = this;

    function mouseMoveHandler(event) {
        var mouseX = event.clientX;
        var mouseY = event.clientY;

        (function (x, y) {
            window.setTimeout((function () {
                self.setPos(x, y);
                if (self.listner) {
                    self.listner.moved(craftPos.x, craftPos.y);
                }
            }), 250);
        })(mouseX, mouseY);
    }

    function isGunLoaded() {
        var now = (new Date()).getTime();
        return (now - lastFired > GUN_LOAD_TIME);
    }

    function clickHandler() {
        self.fire();
    }

    this.makeControllable = function () {
        bgElem.mousemove(mouseMoveHandler);
        bgElem.click(clickHandler);
    };

    this.makeUncontrollable = function () {
        bgElem.unbind('mousemove', mouseMoveHandler);
        bgElem.unbind('click', clickHandler);
    };

    this.fire = function () {
        if (!(isGunLoaded())) {
            return;
        }
        var fireBall = new FireBall(bgElem, {
            x: craftPos.x,
            y: craftPos.y
        }, 'R', opposites);
        fireBall.setOnHit(function (_oppose) {
            var index = opposites.indexOf(_oppose);
            if (index > -1) {
                opposites.splice(index, 1);
            }
            if (self.listner) {
                self.listner.exploded(_oppose.id);
            }
            self.incScore();
        });
        fireBall.fire();
        if (self.listner) {
            self.listner.fired();
        }
        lastFired = (new Date()).getTime();
    };

    this.setPos = function (x, y) {
        craftPos.x = x;
        craftPos.y = y;
        flightElem.css({
            left: craftPos.x - craftSize.w / 2,
            top: craftPos.y - craftSize.h / 2
        });
    };

    this.getPos = function () {
        return craftPos;
    };

    this.getSize = function () {
        return craftSize;
    };

    this.setOpposites = function (_opposites) {
        opposites = _opposites;
    };

    this.explode = function () {
        console.log('Explode Oppose');
        if (isExploded) {
            return;
        }
        self.makeUncontrollable();
        isExploded = true;
        flightElem.fadeOut(100);
        var explosion = new Explosion(bgElem);
        explosion.start(self.getPos().x, self.getPos().y);
        if (onExplode) {
            onExplode();
        }
    };

    this.setOnExplode = function (_onexplode) {
        onExplode = _onexplode;
    };

    this.remove = function () {
        flightElem.remove();
    };

    this.incScore = function () {
        scoreElem.html(++score);
    }

}

function OppositeFlight(bgElem, name) {

    this.id = '';
    this.team = '';
    this.name = '';

    var score = 0;

    var flightElem = $('<div>', {
        id: 'opposite-craft',
        'class': 'spacecraft'
    });
    flightElem.append($('<img>', {
        'src': 'images/lfaceCraft.png',
        'class': 'craft-img'
    }));
    var detailCont = $('<div>', {
        'class': 'craft-name'
    });
    flightElem.append(detailCont);
    detailCont.append($('<span>', {
        text: name + ' : '
    }));
    var scoreElem = $('<span>', {
        text: score
    });
    detailCont.append(scoreElem);
    bgElem.append(flightElem);

    var opposites = [];
    var isExploded = false;
    var onExplode = null;

    var craftSize = {
        w: $(window).width() / 7,
        h: 0
    };
    craftSize.h = craftSize.w * 177 / 671;

    flightElem.css({
        width: craftSize.w,
        height: craftSize.h
    });

    var craftPos = {
        x: 0,
        y: 0
    };

    var self = this;

    this.fire = function () {
        var fireBall = new FireBall(bgElem, {
            x: craftPos.x,
            y: craftPos.y
        }, 'L', opposites);
        fireBall.setOnHit(function (_oppose) {
            var index = opposites.indexOf(_oppose);
            if (index > -1) {
                opposites.splice(index, 1);
            }
        });
        fireBall.fire();
    };

    this.setPos = function (x, y) {
        craftPos.x = x;
        craftPos.y = y;
        flightElem.css({
            left: craftPos.x - craftSize.w / 2,
            top: craftPos.y - craftSize.h / 2
        });
    };

    this.getPos = function () {
        return craftPos;
    };

    this.getSize = function () {
        return craftSize;
    };

    this.explode = function () {
        console.log('Explode Oppose');
        if (isExploded) {
            return;
        }
        isExploded = true;
        flightElem.fadeOut(100);
        var explosion = new Explosion(bgElem);
        explosion.start(self.getPos().x, self.getPos().y);
        if (onExplode) {
            onExplode();
        }
    };

    this.setOpposites = function (_opposites) {
        opposites = _opposites;
    };

    this.setOnExplode = function (_onexplode) {
        onExplode = _onexplode;
    };

    this.remove = function () {
        flightElem.remove();
    };

    this.incScore = function () {
        scoreElem.html(++score);
    }

}

/**
 * Implements the fire ball behaviour
 * @param bgElem
 * @param pos
 * @param dir
 * @param oppos
 * @constructor
 */
function FireBall(bgElem, pos, dir, oppos) {
    var FIRE_POWER = $(window).width() / 50;
    var FIRE_BALL_IMG = (dir == 'R') ? 'images/fireballR.gif' : 'images/fireballL.gif';
    var fireBallElem = $('<img>', {
        'src': FIRE_BALL_IMG,
        'class': 'fireball'
    });
    var onHit = null;

    var ballSize = {
        w: $(window).width() * 2 / 100,
        h: 0
    };
    ballSize.h = ballSize.w * 16 / 48;

    fireBallElem.css({
        width: ballSize.w,
        height: ballSize.h
    });

    var ballPos = {
        x: pos.x - ballSize.w / 2,
        y: pos.y - ballSize.h / 2
    };

    this.fire = function () {
        fireBallElem.css({
            left: ballPos.x,
            top: ballPos.y
        });
        bgElem.append(fireBallElem);
        if (dir == 'R') {
            fireBallElem.animate({
                left: '+=5000'
            }, {
                duration: 2000,
                step: function (now, fx) {
                    for (i in oppos) {
                        var _oppose = oppos[i];
                        var craftPos = _oppose.getPos();
                        ballPos.x = now;
                        var dist = Math.sqrt(Math.pow((ballPos.x - craftPos.x), 2) + Math.pow((ballPos.y - craftPos.y), 2));
                        if (dist < FIRE_POWER) {
                            _oppose.explode();
                            if (onHit) {
                                onHit(_oppose);
                            }
                            stopFireBall();
                        }
                    }
                    if (ballPos.x >= bgElem.width()) {
                        stopFireBall();
                    }
                }
            });
        } else if (dir == 'L') {
            fireBallElem.animate({
                left: '-=5000'
            }, {
                duration: 2000,
                step: function (now, fx) {
                    for (i in oppos) {
                        var _oppose = oppos[i];
                        var craftPos = _oppose.getPos();
                        ballPos.x = now;
                        var dist = Math.sqrt(Math.pow((ballPos.x - craftPos.x), 2) + Math.pow((ballPos.y - craftPos.y), 2));
                        if (dist < FIRE_POWER) {
                            stopFireBall();
                        }
                    }
                    if (ballPos.x < 0) {
                        stopFireBall();
                    }
                }
            });
        }
    };

    this.setOnHit = function (_onHit) {
        onHit = _onHit;
    };

    function stopFireBall() {
        fireBallElem.stop();
        fireBallElem.remove();
    }

}

/**
 * Implements the explosion behaviour
 * @param bgElem
 * @constructor
 */
function Explosion(bgElem) {
    var EXPLOSION_IMG = 'images/explosion.gif';
    var width = $(window).width() / 8;
    var height = width;

    var explElem = $('<img>', {
        'src': EXPLOSION_IMG,
        'class': 'explosion'
    });

    explElem.css({
        width: width,
        height: height
    });

    this.start = function (x, y) {
        explElem.css({
            left: x - width / 2,
            top: y - height / 2
        });
        bgElem.append(explElem);
        window.setTimeout(function () {
            explElem.fadeOut();
        }, 500);
    }
}

/**
 * Class responsible of handling the communication with the server
 * @constructor
 */
function Connector() {

    var url = 'ws://10.100.7.96:9763/Shooter/server.jag';
    var ws = null;
    var uid = '';

    this.onFire = null;

    this.onMove = null;

    this.onExplode = null;

    this.onMember = null;

    this.onUnmember = null;

    var self = this;

    this.connect = function (name, fn) {
        ws = new WebSocket(url);

        ws.onopen = function () {
            console.log('web Socket opened');
            ws.send(JSON.stringify({
                type: 'init',
                name: name
            }));
        };

        ws.onmessage = function (event) {
            console.log('web Socket message');
            var data = JSON.parse(event.data);

            if (data.type == 'init' && fn) {
                console.log('init received ' + JSON.stringify(data));
                uid = data.uid;
                fn(data);
            } else if (data.type == 'move') {
                console.log('web Socket move');
                if (self.onMove) {
                    self.onMove(data);
                }
            } else if (data.type == 'fire') {
                console.log('web Socket fire');
                if (self.onFire) {
                    self.onFire(data);
                }
            } else if (data.type == 'explode') {
                console.log('web Socket explode');
                if (self.onExplode) {
                    self.onExplode(data);
                }
            } else if (data.type == 'member') {
                console.log('web Socket member');
                if (self.onMember) {
                    self.onMember(data);
                }
            } else if (data.type == 'unmember') {
                console.log('web Socket unmember');
                if (self.onUnmember) {
                    self.onUnmember(data);
                }
            }

        };

        ws.onclose = function () {
            console.log('web Socket closed');
        };

    };

    this.close = function () {
        self.send({
            type: 'close',
            id: uid
        });
    };

    this.send = function (data) {
        if (ws) {
            ws.send(JSON.stringify(data));
        }
    };

}