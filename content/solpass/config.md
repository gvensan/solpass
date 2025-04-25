Queue - /msgVpns/{msgVpnName}/queues
  accessType (The access type for delivering messages to consumer flows bound to the Queue)
  egressEnabled (Enable or disable the transmission of messages from the Queue)
  ingressEnabled (Enable or disable the reception of messages to the Queue)
  respectTtlEnabled (Enable or disable the respecting of the time-to-live (TTL) for messages in the Queue)
  maxTtl (The maximum time in seconds a message can stay in the Queue when respectTtlEnabled is "true".)
  msgVpnName (The name of the Message VPN)
  owner (The Client Username that owns the Queue and has permission equivalent to "delete")
  permission (The permission level for all consumers of the Queue, excluding the owner - default no-access)
  queueName (The name of the Queue)
Client Profile - /msgVpns/{msgVpnName}/clientProfiles
  * clientProfileName - The name of the Client Profile
  * msgVpnName - The name of the Message VPN
  * allowGuaranteedMsgReceiveEnabled - Enable or disable allowing clients using the Client Profile to receive guaranteed messages
  * allowGuaranteedMsgSendEnabled - Enable or disable allowing clients using the Client Profile to send guaranteed messages
RDP - /msgVpns/{msgVpnName}/restDeliveryPoints
  * clientProfileName (The Client Profile of the REST Delivery Point)
  msgVpnName (The name of the Message VPN)
  enabled (Enable or disable the REST Delivery Point)
  * restDeliveryPointName (The name of the REST Delivery Point)
  * service (URL)
  * vendor (Pass Owner)
RDP Queue Binding - /msgVpns/{msgVpnName}/restDeliveryPoints/{restDeliveryPointName}/queueBindings
  msgVpnName (The name of the Message VPN)
  postRequestTarget (The request-target string to use when sending requests)s
  queueBindingName (The name of a queue in the Message VPN)
  restDeliveryPointName (The name of the REST Delivery Point)
RDP REST Consumers - /msgVpns/{msgVpnName}/restDeliveryPoints/{restDeliveryPointName}/restConsumers
  restConsumerName (The name of the REST Consumer)
  msgVpnName (The name of the Message VPN)
  restDeliveryPointName (The name of the REST Delivery Point)
  enabled (Enable or disable the REST Consumer)
  authenticationScheme (The authentication scheme used by the REST Consumer to login to the REST host)
  remoteHost (The IP address or DNS name to which the broker is to connect to deliver messages for the REST Consumer)
  remotePort (The port associated with the host of the REST Consumer)
  tlsEnabled (Enable or disable encryption (TLS) for the REST Consumer)

