import 'package:flutter/widgets.dart';

/// A pair of [ScrollController]s that mirror each other's offset, so two
/// separate `Scrollable`s can be dragged directly by the user and stay in
/// lockstep — e.g. the date ruler and the bar canvas below it, or the task
/// list and the chart rows beside it.
///
/// A single `ScrollController` attached to two `Scrollable`s only
/// synchronizes *programmatic* scrolling (`jumpTo`/`animateTo`); a
/// user-initiated drag on one Scrollable moves only that Scrollable's own
/// `ScrollPosition`, not its sibling's. Two independently-attached
/// controllers with listeners that mirror each other are what actually
/// keeps both panes moving together regardless of which one is dragged.
class LinkedScrollControllers {
  final ScrollController first = ScrollController();
  final ScrollController second = ScrollController();
  bool _syncing = false;

  LinkedScrollControllers() {
    first.addListener(() => _sync(from: first, to: second));
    second.addListener(() => _sync(from: second, to: first));
  }

  void _sync({required ScrollController from, required ScrollController to}) {
    if (_syncing || !from.hasClients || !to.hasClients) return;
    final target = from.offset.clamp(
      to.position.minScrollExtent,
      to.position.maxScrollExtent,
    );
    if (target == to.offset) return;
    _syncing = true;
    to.jumpTo(target);
    _syncing = false;
  }

  void dispose() {
    first.dispose();
    second.dispose();
  }
}
