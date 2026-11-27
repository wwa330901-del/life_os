import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../../../core/models/knowledge_brain.dart';

/// 大腦地圖（2026-11-27）：像 Obsidian 的關係圖。大圓點＝主題，小圓點＝收藏，
/// 線＝AI 連的。點會自己排開（簡單的力導向排版），可以拖點、滾輪/兩指縮放、
/// 拖空白處移動整張圖。滑鼠移到點上，跟它連著的會亮、其他變淡；點一下打開。
class BrainGraphView extends StatefulWidget {
  const BrainGraphView({super.key, required this.graph, required this.onOpenItem, required this.onOpenTopic});

  final BrainGraph graph;
  final void Function(String itemId) onOpenItem;
  final void Function(String topicId) onOpenTopic;

  @override
  State<BrainGraphView> createState() => _BrainGraphViewState();
}

class _Node {
  _Node({
    required this.id,
    required this.label,
    required this.isTopic,
    required this.radius,
    required this.pos,
    this.unread = false,
  });

  final String id;
  final String label;
  final bool isTopic;
  final double radius;
  final bool unread;
  Offset pos;
  Offset vel = Offset.zero;
  bool pinned = false;
}

class _BrainGraphViewState extends State<BrainGraphView> with SingleTickerProviderStateMixin {
  late List<_Node> _nodes;
  late Map<String, _Node> _byId;
  late List<(_Node, _Node)> _edges;
  late Map<String, Set<String>> _neighbors;

  late final Ticker _ticker = createTicker(_tick);
  double _alpha = 1;

  double _scale = 1;
  Offset _offset = Offset.zero;
  Size _size = Size.zero;
  bool _centered = false;

  _Node? _dragging;
  _Node? _hover;
  Offset? _downPos;
  double _startScale = 1;
  Offset _startFocal = Offset.zero;
  Offset _startOffset = Offset.zero;

  @override
  void initState() {
    super.initState();
    _build();
    _ticker.start();
  }

  @override
  void didUpdateWidget(covariant BrainGraphView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.graph != widget.graph) {
      final old = {for (final n in _nodes) n.id: n.pos};
      _build(previous: old);
      _reheat(0.5);
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void _build({Map<String, Offset>? previous}) {
    final rnd = math.Random(42);
    final g = widget.graph;
    final topics = g.topics.where((t) => t.count > 0).toList();
    _nodes = [];
    for (var i = 0; i < topics.length; i++) {
      final t = topics[i];
      final angle = 2 * math.pi * i / math.max(1, topics.length);
      final r = 120.0 + 30 * math.sqrt(topics.length);
      _nodes.add(
        _Node(
          id: t.id,
          label: t.name,
          isTopic: true,
          radius: math.min(40, 14 + math.sqrt(t.count) * 5),
          pos: previous?[t.id] ?? Offset(math.cos(angle) * r, math.sin(angle) * r),
        ),
      );
    }
    _byId = {for (final n in _nodes) n.id: n};
    final firstTopic = <String, String>{};
    for (final e in g.edges) {
      if (e.toTopic) firstTopic.putIfAbsent(e.from, () => e.to);
    }
    for (final item in g.items) {
      final anchor = _byId[firstTopic[item.id]]?.pos ?? Offset.zero;
      final n = _Node(
        id: item.id,
        label: item.title,
        isTopic: false,
        radius: 6,
        unread: !item.read,
        pos: previous?[item.id] ?? anchor + Offset(rnd.nextDouble() * 80 - 40, rnd.nextDouble() * 80 - 40),
      );
      _nodes.add(n);
      _byId[n.id] = n;
    }
    _edges = [
      for (final e in g.edges)
        if (_byId[e.from] != null && _byId[e.to] != null) (_byId[e.from]!, _byId[e.to]!),
    ];
    _neighbors = {};
    for (final (a, b) in _edges) {
      (_neighbors[a.id] ??= {}).add(b.id);
      (_neighbors[b.id] ??= {}).add(a.id);
    }
  }

  void _reheat(double to) {
    _alpha = math.max(_alpha, to);
    if (!_ticker.isActive) _ticker.start();
  }

  /// 一步力導向：點跟點互相推開、線把兩端拉近、全部輕輕往中間收。
  void _tick(Duration _) {
    if (_alpha < 0.005) {
      _ticker.stop();
      return;
    }
    final n = _nodes.length;
    for (var i = 0; i < n; i++) {
      final a = _nodes[i];
      for (var j = i + 1; j < n; j++) {
        final b = _nodes[j];
        var d = a.pos - b.pos;
        var dist2 = d.distanceSquared;
        if (dist2 < 0.01) {
          d = Offset(math.Random().nextDouble() - 0.5, math.Random().nextDouble() - 0.5);
          dist2 = 0.25;
        }
        if (dist2 > 250000) continue;
        final strength = (a.isTopic || b.isTopic ? 2400.0 : 700.0) / dist2;
        final push = d * strength * _alpha;
        a.vel += push;
        b.vel -= push;
      }
    }
    for (final (a, b) in _edges) {
      final d = b.pos - a.pos;
      final dist = math.max(1.0, d.distance);
      final rest = (a.isTopic || b.isTopic) ? 70.0 : 55.0;
      final pull = d / dist * ((dist - rest) * 0.04 * _alpha);
      a.vel += pull;
      b.vel -= pull;
    }
    for (final node in _nodes) {
      if (node.pinned) {
        node.vel = Offset.zero;
        continue;
      }
      node.vel -= node.pos * (0.006 * _alpha);
      node.vel *= 0.6;
      node.pos += node.vel;
    }
    _alpha *= 0.985;
    setState(() {});
  }

  Offset _toWorld(Offset screen) => (screen - _offset) / _scale;

  _Node? _hit(Offset screen) {
    final w = _toWorld(screen);
    _Node? best;
    var bestD = double.infinity;
    for (final node in _nodes) {
      final d = (node.pos - w).distance;
      final r = node.radius + 6 / _scale;
      if (d <= r && d < bestD) {
        best = node;
        bestD = d;
      }
    }
    return best;
  }

  void _zoomAt(Offset focal, double factor) {
    final newScale = (_scale * factor).clamp(0.2, 4.0);
    final world = _toWorld(focal);
    setState(() {
      _scale = newScale;
      _offset = focal - world * _scale;
    });
  }

  void _fit() {
    if (_nodes.isEmpty || _size == Size.zero) return;
    var minX = double.infinity, minY = double.infinity, maxX = -double.infinity, maxY = -double.infinity;
    for (final n in _nodes) {
      minX = math.min(minX, n.pos.dx);
      minY = math.min(minY, n.pos.dy);
      maxX = math.max(maxX, n.pos.dx);
      maxY = math.max(maxY, n.pos.dy);
    }
    final w = math.max(100.0, maxX - minX + 120), h = math.max(100.0, maxY - minY + 120);
    setState(() {
      _scale = math.min(_size.width / w, _size.height / h).clamp(0.2, 2.0);
      _offset = Offset(_size.width / 2, _size.height / 2) - Offset((minX + maxX) / 2, (minY + maxY) / 2) * _scale;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, constraints) {
        _size = constraints.biggest;
        if (!_centered && _size.width > 0) {
          _centered = true;
          _offset = Offset(_size.width / 2, _size.height / 2);
          WidgetsBinding.instance.addPostFrameCallback(
            (_) => Future.delayed(const Duration(milliseconds: 1500), () {
              if (mounted) _fit();
            }),
          );
        }
        return Stack(
          children: [
            Positioned.fill(
              child: Listener(
                onPointerSignal: (event) {
                  if (event is PointerScrollEvent) _zoomAt(event.localPosition, event.scrollDelta.dy > 0 ? 0.9 : 1.1);
                },
                child: MouseRegion(
                  cursor: _hover != null ? SystemMouseCursors.click : SystemMouseCursors.grab,
                  onHover: (e) {
                    final h = _hit(e.localPosition);
                    if (h != _hover) setState(() => _hover = h);
                  },
                  onExit: (_) => setState(() => _hover = null),
                  child: GestureDetector(
                    onScaleStart: (d) {
                      _downPos = d.localFocalPoint;
                      _startScale = _scale;
                      _startFocal = d.localFocalPoint;
                      _startOffset = _offset;
                      final hit = d.pointerCount == 1 ? _hit(d.localFocalPoint) : null;
                      if (hit != null) {
                        _dragging = hit..pinned = true;
                        _reheat(0.3);
                      }
                    },
                    onScaleUpdate: (d) {
                      final drag = _dragging;
                      if (drag != null && d.pointerCount == 1) {
                        drag.pos = _toWorld(d.localFocalPoint);
                        _reheat(0.3);
                        return;
                      }
                      setState(() {
                        final newScale = (_startScale * d.scale).clamp(0.2, 4.0);
                        final world = (_startFocal - _startOffset) / _startScale;
                        _scale = newScale;
                        _offset = d.localFocalPoint - world * _scale;
                      });
                    },
                    onScaleEnd: (_) {
                      _dragging?.pinned = false;
                      _dragging = null;
                    },
                    onTapUp: (d) {
                      final hit = _hit(d.localPosition);
                      if (hit == null) return;
                      if (_downPos != null && (d.localPosition - _downPos!).distance > 8) return;
                      hit.isTopic ? widget.onOpenTopic(hit.id) : widget.onOpenItem(hit.id);
                    },
                    child: CustomPaint(
                      painter: _GraphPainter(
                        nodes: _nodes,
                        edges: _edges,
                        focus: _hover ?? _dragging,
                        neighbors: _neighbors,
                        scale: _scale,
                        offset: _offset,
                        scheme: scheme,
                      ),
                      size: Size.infinite,
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              right: 8,
              bottom: 8,
              child: Card(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: '縮小',
                      icon: const Icon(Icons.remove),
                      onPressed: () => _zoomAt(Offset(_size.width / 2, _size.height / 2), 0.8),
                    ),
                    IconButton(tooltip: '整張圖放進畫面', icon: const Icon(Icons.fit_screen_outlined), onPressed: _fit),
                    IconButton(
                      tooltip: '放大',
                      icon: const Icon(Icons.add),
                      onPressed: () => _zoomAt(Offset(_size.width / 2, _size.height / 2), 1.25),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _GraphPainter extends CustomPainter {
  _GraphPainter({
    required this.nodes,
    required this.edges,
    required this.focus,
    required this.neighbors,
    required this.scale,
    required this.offset,
    required this.scheme,
  });

  final List<_Node> nodes;
  final List<(_Node, _Node)> edges;
  final _Node? focus;
  final Map<String, Set<String>> neighbors;
  final double scale;
  final Offset offset;
  final ColorScheme scheme;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.translate(offset.dx, offset.dy);
    canvas.scale(scale);

    final near = focus == null ? null : {focus!.id, ...?neighbors[focus!.id]};
    bool lit(_Node n) => near == null || near.contains(n.id);

    final edgePaint = Paint()..strokeWidth = 1.2 / scale;
    for (final (a, b) in edges) {
      final on = near != null && (a == focus || b == focus);
      edgePaint.color = on
          ? scheme.primary.withValues(alpha: 0.9)
          : scheme.outline.withValues(alpha: near == null ? 0.35 : 0.08);
      canvas.drawLine(a.pos, b.pos, edgePaint);
    }

    final fill = Paint();
    final stroke = Paint()..style = PaintingStyle.stroke;
    for (final n in nodes) {
      final dim = !lit(n);
      if (n.isTopic) {
        fill.color = scheme.surface;
        stroke
          ..color = scheme.primary.withValues(alpha: dim ? 0.2 : 1)
          ..strokeWidth = 3;
        canvas.drawCircle(n.pos, n.radius, fill);
        canvas.drawCircle(n.pos, n.radius, stroke);
      } else {
        fill.color = (n.unread ? scheme.primary : scheme.onSurfaceVariant).withValues(alpha: dim ? 0.15 : 0.85);
        canvas.drawCircle(n.pos, n.radius, fill);
      }
    }

    for (final n in nodes) {
      final dim = !lit(n);
      final show = n.isTopic || (near != null && !dim) || scale >= 1.4;
      if (!show) continue;
      final tp = TextPainter(
        text: TextSpan(
          text: n.label.length > 14 ? '${n.label.substring(0, 14)}…' : n.label,
          style: TextStyle(
            fontSize: n.isTopic ? 14 : 12,
            fontWeight: n.isTopic ? FontWeight.w700 : FontWeight.w400,
            color: scheme.onSurface.withValues(alpha: dim ? 0.25 : 1),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final at = n.isTopic ? n.pos - Offset(tp.width / 2, tp.height / 2) : n.pos + Offset(-tp.width / 2, n.radius + 3);
      tp.paint(canvas, at);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GraphPainter oldDelegate) => true;
}
