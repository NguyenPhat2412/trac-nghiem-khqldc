package vn.vju.quiz;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import vn.vju.quiz.Domain.*;

class ResourceSafetyTest {
  @Test
  void seededPermutationSurvivesRestartAndHonorsLegacyOrder() throws Exception {
    Store store = mock(Store.class);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    Member m = new Member();
    m.optionSeed = UUID.randomUUID().toString();
    Question q = new Question();
    var order = service.order(m, q);
    assertEquals(Set.of(0, 1, 2, 3), new HashSet<>(order));
    var json = new ObjectMapper();
    assertEquals(order, service.order(json.readValue(json.writeValueAsString(m), Member.class), q));
    m.optionOrders.put(q.id, List.of(3, 2, 1, 0));
    assertEquals(List.of(3, 2, 1, 0), service.order(m, q));
  }

  @Test
  void saturatedBansDenyNewAdmissionWithoutEvictingOldBans() {
    Store store = mock(Store.class);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    Room r = new Room();
    r.id = "123456";
    for (int i = 0; i < 1000; i++) r.bannedIds.add("blocked" + i);
    when(store.liveRoom(r.id, true)).thenReturn(r);
    assertThrows(
        RuntimeException.class, () -> service.join(new Actor("new", "New", "GUEST", "csrf"), r.id));
    assertThrows(
        RuntimeException.class,
        () -> service.join(new Actor("blocked0", "Old", "GUEST", "csrf"), r.id));
    assertEquals(1000, r.bannedIds.size());
    verify(store, never()).save(anyString(), anyString(), any());
  }

  @Test
  void expiredUnlockedReadRechecksMembershipAfterLock() {
    Store store = mock(Store.class);
    var service =
        new RoomService(store, new ContentService(store), mock(SimpMessagingTemplate.class));
    Room stale = new Room();
    stale.id = "123456";
    stale.status = "QUESTION";
    stale.deadline = 1;
    stale.hostId = "host";
    Member m = new Member();
    m.id = "p";
    stale.members.put(m.id, m);
    Room current = new Room();
    current.id = stale.id;
    current.hostId = "host";
    when(store.liveRoom(stale.id, false)).thenReturn(stale);
    when(store.liveRoom(stale.id, true)).thenReturn(current);
    assertThrows(
        RuntimeException.class,
        () -> service.get(new Actor("p", "Player", "GUEST", "csrf"), stale.id));
    verify(store, never()).save(anyString(), anyString(), any());
  }
}
