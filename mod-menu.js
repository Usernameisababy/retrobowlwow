(function () {
  function boot() {
    if (typeof GameMaker_Init !== "function") {
      setTimeout(boot, 40);
      return;
    }
    GameMaker_Init();
    installGameplayHooks();
  }

  window.addEventListener("load", function () {
    window.PokiSDK = null;
    window.PokiSDK_OK = false;
    boot();
  });

  var SAVE_KEYS = [
    "RetroBowl.0.savedata.ini",
    "RetroBowlModded.0.savedata.ini"
  ];

  var OPT_KEYS = [
    "RetroBowl.0.optiondata.dat",
    "RetroBowlModded.0.optiondata.dat"
  ];

  var panel = document.getElementById("jax-panel");
  var openBtn = document.getElementById("jax-open");
  var dimmer = document.getElementById("jax-dimmer");
  var exportBox = document.getElementById("jax-export");
  var exportName = document.getElementById("export-name");
  var MOD_SETTINGS_KEY = "jax_gameplay_mods";

  var gameplayMods = (window.JaxMods = {
    fieldGoalAimbot: false,
    noTackles: false,
    noFumbles: false,
    noInjuries: false,
    infiniteQBThrowRange: false,
    freezeClock: false,
    unlimitedDowns: false,
    infiniteStamina: false,
    noInterceptions: false,
    autoStiffArm: false,
    playerSpeedMult: 1
  });

  var frozenClock = null;
  var tickerMessageIndex = 0;
  var playerObjectIds = null;
  var stiffArmCooldown = 0;
  var uiState = 0;

  if (typeof window._Q_ === "function") {
    window._Q_ = function () {
      tickerMessageIndex = (tickerMessageIndex + 1) % 2;
      return tickerMessageIndex === 0
        ? "tell people about this bruh"
        : "Mod made by Max ";
    };
  }

  try {
    var savedGameplayMods = JSON.parse(
      localStorage.getItem(MOD_SETTINGS_KEY) || "{}"
    );

    Object.keys(gameplayMods).forEach(function (name) {
      if (
        typeof savedGameplayMods[name] === "boolean" ||
        typeof savedGameplayMods[name] === "number"
      ) {
        gameplayMods[name] = savedGameplayMods[name];
      }
    });

    if (typeof gameplayMods.playerSpeedMult === "number") {
      gameplayMods.playerSpeedMult = Math.max(
        1,
        Math.min(gameplayMods.playerSpeedMult, 3)
      );
    } else {
      gameplayMods.playerSpeedMult = 1;
    }
  } catch (err) {
    gameplayMods.playerSpeedMult = 1;
  }

  function saveGameplayMods() {
    localStorage.setItem(
      MOD_SETTINGS_KEY,
      JSON.stringify(gameplayMods)
    );
  }

  function isTypingBox(el) {
    if (!el || !el.tagName) return false;

    var tag = el.tagName.toUpperCase();

    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;

    var type = (el.type || "text").toLowerCase();

    return (
      type === "text" ||
      type === "number" ||
      type === "search" ||
      type === "tel" ||
      type === "url" ||
      type === "password" ||
      type === ""
    );
  }

  function eachList(list, fn) {
    if (!list) return;

    if (typeof list.forEach === "function") {
      list.forEach(fn);
      return;
    }

    for (var key in list) {
      if (!Object.prototype.hasOwnProperty.call(list, key)) continue;
      fn(list[key], key);
    }
  }

  function findPlayerObjectIds() {
    if (playerObjectIds && playerObjectIds.length) {
      return playerObjectIds;
    }

    var ids = [];

    if (typeof window._si !== "function") return ids;

    for (var id = 0; id < 140; id++) {
      var list;

      try {
        list = window._si(id);
      } catch (err) {
        continue;
      }

      if (!list) continue;

      var hit = false;

      eachList(list, function (inst) {
        if (hit || !inst) return;

        if (
          inst._O01 !== undefined &&
          (inst._j51 !== undefined || inst._W1 !== undefined)
        ) {
          hit = true;
        }
      });

      if (hit) ids.push(id);
    }

    if (ids.length) playerObjectIds = ids;

    return ids;
  }

  function eachFieldPlayer(fn) {
    if (typeof window._si !== "function") return;

    findPlayerObjectIds().forEach(function (id) {
      var list;

      try {
        list = window._si(id);
      } catch (err) {
        return;
      }

      eachList(list, function (inst) {
        if (inst && inst._O01 !== undefined) fn(inst);
      });
    });
  }

  function getBallHolder() {
    try {
      if (window.global && window.global._d01 !== undefined) {
        var balls = window._si(window.global._d01);
        var holder = null;

        eachList(balls, function (b) {
          if (
            !holder &&
            b &&
            b._X_ !== undefined &&
            b._X_ !== null &&
            b._X_ !== -4
          ) {
            holder = b._X_;
          }
        });

        return holder;
      }
    } catch (err) {}

    return null;
  }

  function getInstanceById(id) {
    if (id === null || id === undefined || id === -4) {
      return null;
    }

    var found = null;

    eachFieldPlayer(function (inst) {
      if (found) return;
      if (inst.id === id || inst === id) found = inst;
    });

    if (found) return found;

    if (
      typeof id === "object" &&
      id &&
      id._O01 !== undefined
    ) {
      return id;
    }

    return null;
  }

  function dist2(a, b) {
    var dx = (a.x || 0) - (b.x || 0);
    var dy = (a.y || 0) - (b.y || 0);

    return dx * dx + dy * dy;
  }

  function applyAutoStiffArm() {
    if (!gameplayMods.autoStiffArm) return;

    if (stiffArmCooldown > 0) {
      stiffArmCooldown -= 1;
      return;
    }

    var holderId = getBallHolder();

    if (holderId === null) return;

    var carrier = getInstanceById(holderId);

    if (!carrier || carrier._lT === false || carrier._lT === 0) {
      return;
    }

    carrier._p51 = 2;

    if (carrier._u51 !== undefined) {
      carrier._u51 = 2;
    }

    var near = [];

    eachFieldPlayer(function (player) {
      if (!player || player === carrier) return;
      if (player._lT === true || player._lT === 1) return;
      if (player._v21 || player._k31) return;

      if (dist2(carrier, player) < 900) {
        near.push(player);
      }
    });

    if (!near.length) return;

    near.sort(function (a, b) {
      return dist2(carrier, a) - dist2(carrier, b);
    });

    var target = near[0];

    carrier._p51 = 2;
    carrier._l31 = target.id !== undefined ? target.id : target;

    try {
      if (
        typeof target.y === "number" &&
        typeof carrier.y === "number"
      ) {
        target._Ea = carrier.y < target.y ? 2.2 : -2.2;
      }

      if (
        typeof target.x === "number" &&
        typeof carrier.x === "number"
      ) {
        var push = carrier.x < target.x ? 3.5 : -3.5;

        target.x = target.x + push;

        if (target._Da !== undefined) {
          target._Da = push * 0.6;
        }
      }
    } catch (err) {}

    stiffArmCooldown = 8;
  }

  function forceClockFrozen(match) {
    if (!match) return;

    if (!frozenClock) {
      frozenClock = {
        minutes: match._r11,
        seconds: match._s11,
        quarter: match._Wy
      };
    }

    match._r11 = frozenClock.minutes;
    match._s11 = frozenClock.seconds;

    if (match._Yc1 !== undefined) match._Yc1 = 0;

    if (match._Tb1 !== undefined) {
      match._Tb1 = frozenClock.minutes * 60 + frozenClock.seconds;
    }

    if (match._Vb1 !== undefined) {
      match._Vb1 = frozenClock.minutes * 60 + frozenClock.seconds;
    }
  }

  function installGameplayHooks() {
    var originalDropBall = window._W31;

    if (
      typeof originalDropBall === "function" &&
      !originalDropBall.__jaxHooked
    ) {
      window._W31 = function () {
        if (gameplayMods.noFumbles) return;
        return originalDropBall.apply(this, arguments);
      };

      window._W31.__jaxHooked = true;
    }

    var originalInjuryCheck = window._mf1;

    if (
      typeof originalInjuryCheck === "function" &&
      !originalInjuryCheck.__jaxHooked
    ) {
      window._mf1 = function () {
        if (gameplayMods.noInjuries) return 0;
        return originalInjuryCheck.apply(this, arguments);
      };

      window._mf1.__jaxHooked = true;
    }

    var originalSubtractTime = window._Ad1;

    if (
      typeof originalSubtractTime === "function" &&
      !originalSubtractTime.__jaxHooked
    ) {
      window._Ad1 = function () {
        if (gameplayMods.freezeClock) {
          forceClockFrozen(arguments[0] || activeMatch());
          return;
        }

        return originalSubtractTime.apply(this, arguments);
      };

      window._Ad1.__jaxHooked = true;
    }

    var originalTimeAccum = window._0c1;

    if (
      typeof originalTimeAccum === "function" &&
      !originalTimeAccum.__jaxHooked
    ) {
      window._0c1 = function () {
        if (gameplayMods.freezeClock) {
          forceClockFrozen(arguments[0] || activeMatch());
          return;
        }

        return originalTimeAccum.apply(this, arguments);
      };

      window._0c1.__jaxHooked = true;
    }

    var originalApplyTime = window._Id1;

    if (
      typeof originalApplyTime === "function" &&
      !originalApplyTime.__jaxHooked
    ) {
      window._Id1 = function () {
        if (gameplayMods.freezeClock) {
          forceClockFrozen(activeMatch());
          return;
        }

        return originalApplyTime.apply(this, arguments);
      };

      window._Id1.__jaxHooked = true;
    }

    var originalTackle = window._f81;

    if (
      typeof originalTackle === "function" &&
      !originalTackle.__jaxHooked
    ) {
      window._f81 = function () {
        if (gameplayMods.noTackles) return;

        if (gameplayMods.autoStiffArm && arguments[0]) {
          var self = arguments[0];

          if (self && (self._lT === true || self._lT === 1)) {
            self._p51 = 2;

            if (self._u51 !== undefined) {
              self._u51 = 2;
            }
          }
        }

        return originalTackle.apply(this, arguments);
      };

      window._f81.__jaxHooked = true;
    }
