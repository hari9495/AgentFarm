<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <!--
      ESL listens on all interfaces so AgentFarm containers can connect.
      In production, restrict access via Docker network ACLs — do not
      expose port 8021 to the public internet.
    -->
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="0.0.0.0"/>
    <param name="listen-port" value="8021"/>

    <!-- Password injected from ESL_PASSWORD env var by docker-entrypoint.sh -->
    <param name="password" value="${ESL_PASSWORD}"/>

    <!--
      Allow connections from any IPv4 address inside the Docker network.
      The agentfarm bridge network is isolated — external access requires
      explicit port mapping in docker-compose.yml.
    -->
    <param name="apply-inbound-acl" value="any_v4"/>
  </settings>
</configuration>
